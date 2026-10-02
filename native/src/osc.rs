//! OSC 11 wire format: building the query and reading the reply.
//!
//! Pure functions, no I/O and no terminal state, so they can be tested
//! directly.

use crate::appearance::Appearance;

const QUERY: &[u8] = b"\x1b]11;?\x1b\\";
const REPLY_START: &[u8] = b"\x1b]11;";

/// Builds the OSC 11 query. Inside tmux the sequence is wrapped in a
/// passthrough (`DCS tmux; ... ST`) with every ESC doubled, so the outer
/// terminal answers instead of tmux replying with its own cached background.
/// Requires `allow-passthrough on`.
pub fn build_query(in_tmux: bool) -> Vec<u8> {
    if !in_tmux {
        return QUERY.to_vec();
    }

    let mut out = Vec::with_capacity(QUERY.len() * 2 + 9);
    out.extend_from_slice(b"\x1bPtmux;");
    for &byte in QUERY {
        if byte == 0x1b {
            out.push(0x1b);
        }
        out.push(byte);
    }
    out.extend_from_slice(b"\x1b\\");
    out
}

/// True once the buffer holds a terminated reply (ST or BEL). Reading stops
/// there so the reply is consumed and nothing more: typeahead that arrives
/// after it stays in the terminal's buffer. A BEL or ST typed before the reply
/// does not count.
pub fn reply_complete(buf: &[u8]) -> bool {
    matches!(reply_span(buf), Some((_, Some(_))))
}

/// The bytes in `buf` that are not the reply: keys the user pressed while the
/// query was in flight. An unterminated reply runs to the end of the buffer.
pub fn strip_reply(buf: &[u8]) -> Vec<u8> {
    let Some((start, end)) = reply_span(buf) else {
        return buf.to_vec();
    };
    let end = end.unwrap_or(buf.len());
    [&buf[..start], &buf[end..]].concat()
}

/// Where the reply sits in `buf`: its start, and the index just past its
/// terminator once that has arrived.
fn reply_span(buf: &[u8]) -> Option<(usize, Option<usize>)> {
    let start = buf
        .windows(REPLY_START.len())
        .position(|window| window == REPLY_START)?;
    let body = start + REPLY_START.len();
    let end = terminator_end(&buf[body..]).map(|offset| body + offset);
    Some((start, end))
}

/// Index just past the first ST or BEL, whichever comes first.
fn terminator_end(rest: &[u8]) -> Option<usize> {
    let bel = rest.iter().position(|&byte| byte == 0x07).map(|i| i + 1);
    let st = rest
        .windows(2)
        .position(|pair| pair == b"\x1b\\")
        .map(|i| i + 2);
    [bel, st].into_iter().flatten().min()
}

/// Parses `...]11;rgb:RR/GG/BB...` (1-4 hex digits per component, `rgba:` too)
/// into 8-bit values. Takes the last match, so a stale earlier reply cannot
/// decide the answer.
pub fn parse_background(buf: &[u8]) -> Option<[u32; 3]> {
    let start = buf.windows(4).rposition(|window| window == b"]11;")? + 4;
    let rest = &buf[start..];

    let mut cursor = if rest.starts_with(b"rgba:") {
        &rest[5..]
    } else if rest.starts_with(b"rgb:") {
        &rest[4..]
    } else {
        return None;
    };

    let mut components = [0u32; 3];
    for (index, slot) in components.iter_mut().enumerate() {
        let end = cursor
            .iter()
            .position(|byte| !byte.is_ascii_hexdigit())
            .unwrap_or(cursor.len());
        *slot = scale_component(&cursor[..end])?;
        cursor = &cursor[end..];

        if index < 2 {
            if cursor.first() != Some(&b'/') {
                return None;
            }
            cursor = &cursor[1..];
        }
    }
    Some(components)
}

/// Scales a 1-4 digit hex component to 8 bits, as in xterm's `rgb:` spec.
fn scale_component(digits: &[u8]) -> Option<u32> {
    if digits.is_empty() || digits.len() > 4 {
        return None;
    }

    let mut value: u32 = 0;
    for &digit in digits {
        value = value * 16 + (digit as char).to_digit(16)?;
    }

    Some(match digits.len() {
        1 => value * 17, // 0xF    -> 0xFF
        2 => value,      // 0xFF   -> 0xFF
        3 => value >> 4, // 0xFFF  -> 0xFF
        _ => value >> 8, // 0xFFFF -> 0xFF
    })
}

/// BT.601 luminance on 0-255; below the midpoint is dark.
pub fn appearance_from_rgb([r, g, b]: [u32; 3]) -> Appearance {
    if (299 * r + 587 * g + 114 * b) / 1000 < 128 {
        Appearance::Dark
    } else {
        Appearance::Light
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_a_plain_query() {
        assert_eq!(build_query(false), b"\x1b]11;?\x1b\\".to_vec());
    }

    #[test]
    fn doubles_escapes_inside_tmux() {
        let query = build_query(true);
        assert_eq!(&query[..7], b"\x1bPtmux;");
        assert_eq!(&query[7..17], b"\x1b\x1b]11;?\x1b\x1b\\");
        assert_eq!(&query[query.len() - 2..], b"\x1b\\");
    }

    #[test]
    fn detects_terminated_replies() {
        assert!(!reply_complete(b"\x1b]11;rgb:00/00/00"));
        assert!(reply_complete(b"\x1b]11;rgb:00/00/00\x1b\\"));
        assert!(reply_complete(b"\x1b]11;rgb:00/00/00\x07"));
    }

    #[test]
    fn a_terminator_typed_before_the_reply_does_not_end_it() {
        assert!(!reply_complete(b"\x07\x1b\\"));
        assert!(!reply_complete(b"\x07\x1b]11;rgb:00/00/00"));
    }

    #[test]
    fn strips_the_reply_and_keeps_the_keys_around_it() {
        assert_eq!(
            strip_reply(b"git\x1b]11;rgb:1515/1515/1515\x1b\\ st"),
            b"git st".to_vec()
        );
        assert_eq!(strip_reply(b"\x1b]11;rgb:15/15/15\x07ls"), b"ls".to_vec());
    }

    #[test]
    fn keeps_everything_when_no_reply_arrived() {
        assert_eq!(strip_reply(b"git st"), b"git st".to_vec());
        assert_eq!(strip_reply(b""), Vec::<u8>::new());
    }

    #[test]
    fn drops_an_unterminated_reply() {
        assert_eq!(strip_reply(b"ls\x1b]11;rgb:15/1"), b"ls".to_vec());
    }

    #[test]
    fn parses_sixteen_bit_components() {
        assert_eq!(
            parse_background(b"\x1b]11;rgb:1515/1515/1515\x1b\\"),
            Some([0x15, 0x15, 0x15])
        );
    }

    #[test]
    fn parses_eight_bit_components() {
        assert_eq!(
            parse_background(b"\x1b]11;rgb:15/1a/ff\x07"),
            Some([0x15, 0x1a, 0xff])
        );
    }

    #[test]
    fn scales_short_components() {
        assert_eq!(
            parse_background(b"\x1b]11;rgb:f/f/f\x1b\\"),
            Some([0xff; 3])
        );
        assert_eq!(
            parse_background(b"\x1b]11;rgb:001/002/003\x1b\\"),
            Some([0x00, 0x00, 0x00])
        );
    }

    #[test]
    fn ignores_the_alpha_component() {
        assert_eq!(
            parse_background(b"\x1b]11;rgba:1111/2222/3333/ffff\x1b\\"),
            Some([0x11, 0x22, 0x33])
        );
    }

    #[test]
    fn the_last_reply_wins() {
        assert_eq!(
            parse_background(b"\x1b]11;rgb:00/00/00\x1b\\\x1b]11;rgb:ff/ff/ff\x1b\\"),
            Some([0xff, 0xff, 0xff])
        );
    }

    #[test]
    fn rejects_malformed_replies() {
        assert_eq!(parse_background(b""), None);
        assert_eq!(parse_background(b"no reply here"), None);
        assert_eq!(parse_background(b"]11;"), None);
        assert_eq!(parse_background(b"\x1b]11;hsl:1/2/3\x1b\\"), None);
        assert_eq!(parse_background(b"\x1b]11;rgb:15/1a\x1b\\"), None);
        assert_eq!(parse_background(b"\x1b]11;rgb:xx/yy/zz\x1b\\"), None);
        assert_eq!(parse_background(b"\x1b]11;rgb:11111/1/1\x1b\\"), None);
    }

    #[test]
    fn decides_dark_from_luminance() {
        assert_eq!(appearance_from_rgb([0, 0, 0]), Appearance::Dark);
        assert_eq!(appearance_from_rgb([0x15; 3]), Appearance::Dark);
        assert_eq!(appearance_from_rgb([127; 3]), Appearance::Dark);
        assert_eq!(appearance_from_rgb([128; 3]), Appearance::Light);
        assert_eq!(appearance_from_rgb([0xff; 3]), Appearance::Light);
    }
}
