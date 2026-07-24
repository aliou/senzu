{
  config,
  lib,
  inputs ? null,
  pkgs ? config.nixpkgs.pkgs or (throw "nixpkgs instance required"),
  ...
}:
let
  cfg = config.programs.senzu;

  # All variant names produced by the generators.
  allVariants = [
    "senzu"
    "senzu-mono"
    "senzu-light"
    "senzu-mono-light"
    "senzu-muted"
    "senzu-muted-light"
    "senzu-hc"
    "senzu-hc-light"
    "senzu-warm"
  ];

  # Automatically derive the themes package from the flake input.
  defaultThemesPackage =
    if inputs != null && inputs ? senzu then
      inputs.senzu.packages.${pkgs.system}.themes
    else
      null;

  # Helper to build the list of variants to install for a program.
  # If `variants` is null, install all. Otherwise install only the listed ones.
  variantsToInstall = variants:
    if variants == null then allVariants else variants;

  # Helper that builds home.file entries for a given target dir, source subdir,
  # and variant list.
  mkFileEntries = sourceDir: destDir: variants: ext:
    lib.listToAttrs (
      map (name: {
        name = "${destDir}/${name}${ext}";
        value = {
          source = "${sourceDir}/${name}${ext}";
        };
      }) (variantsToInstall variants)
    );

  # Yazi flavors are directories named <variant>.yazi.
  mkYaziEntries = sourceDir: destDir: variants:
    lib.listToAttrs (
      map (name: {
        name = "${destDir}/${name}.yazi";
        value = {
          source = "${sourceDir}/${name}.yazi";
        };
      }) (variantsToInstall variants)
    );
in
{
  options.programs.senzu = {
    enable = lib.mkEnableOption "Senzu color themes for terminal and editor applications";

    package = lib.mkOption {
      type = lib.types.nullOr lib.types.package;
      default = defaultThemesPackage;
      description = ''
        The senzu themes package to use.
        Automatically uses the flake input if available.
      '';
    };

    ghostty = {
      enable = lib.mkEnableOption "Ghostty terminal themes" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = ''
          Which variants to install. Null installs all.
          Example: [ "senzu" "senzu-mono" ]
        '';
      };
    };

    wezterm = {
      enable = lib.mkEnableOption "WezTerm terminal themes (TOML)" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = "Which variants to install. Null installs all.";
      };
    };

    tmux = {
      enable = lib.mkEnableOption "tmux themes" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = "Which variants to install. Null installs all.";
      };
    };

    neovim = {
      enable = lib.mkEnableOption "Neovim colorschemes" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = "Which variants to install. Null installs all.";
      };
    };

    zed = {
      enable = lib.mkEnableOption "Zed editor theme" // { default = true; };
      # Zed uses a single family file containing all variants; no per-variant selection.
    };

    pi = {
      enable = lib.mkEnableOption "Pi coding agent themes" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = "Which variants to install. Null installs all.";
      };
    };

    bat = {
      enable = lib.mkEnableOption "bat / delta themes (TextMate .tmTheme)" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = ''
          Which variants to install. Null installs all.
          After installing (or changing variants), run `bat cache --build` so
          bat picks up the new themes from ~/.config/bat/themes/.
        '';
      };
    };

    fzf = {
      enable = lib.mkEnableOption "fzf color snippets" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = ''
          Which variants to install. Null installs all.
          Each variant is a shell snippet in ~/.config/fzf/ that appends a
          Senzu --color spec to FZF_DEFAULT_OPTS when sourced.
        '';
      };
    };

    yazi = {
      enable = lib.mkEnableOption "Yazi file manager flavors" // { default = true; };
      variants = lib.mkOption {
        type = lib.types.nullOr (lib.types.listOf lib.types.str);
        default = null;
        description = ''
          Which variants to install. Null installs all.
          Select an installed flavor in ~/.config/yazi/theme.toml, for example:
          [flavor]
          dark = "senzu"
        '';
      };
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.package != null;
        message = ''
          programs.senzu: Could not automatically determine the themes package.
          Make sure senzu is added as a flake input and passed via extraSpecialArgs.
        '';
      }
    ];

    home.file = lib.mkMerge [
      # Ghostty themes
      (lib.mkIf cfg.ghostty.enable (
        mkFileEntries "${cfg.package}/share/ghostty"
          "${config.xdg.configHome}/ghostty/themes" cfg.ghostty.variants ""
      ))

      # WezTerm themes (TOML)
      (lib.mkIf cfg.wezterm.enable (
        mkFileEntries "${cfg.package}/share/wezterm"
          "${config.xdg.configHome}/wezterm/colors" cfg.wezterm.variants ".toml"
      ))

      # tmux themes
      (lib.mkIf cfg.tmux.enable (
        mkFileEntries "${cfg.package}/share/tmux"
          "${config.home.homeDirectory}/.tmux/themes/senzu" cfg.tmux.variants ".tmuxtheme"
      ))

      # Neovim colorschemes (as opt plugin in pack path)
      (lib.mkIf cfg.neovim.enable (
        mkFileEntries "${cfg.package}/share/neovim"
          "${config.xdg.dataHome}/nvim/site/pack/senzu/opt/senzu/colors" cfg.neovim.variants ".lua"
      ))

      # Zed theme family (single file)
      (lib.mkIf cfg.zed.enable {
        "${config.home.homeDirectory}/.config/zed/themes/senzu.json".source =
          "${cfg.package}/share/zed/senzu.json";
      })

      # Pi themes
      (lib.mkIf cfg.pi.enable (
        mkFileEntries "${cfg.package}/share/pi"
          "${config.xdg.configHome}/pi/themes" cfg.pi.variants ".json"
      ))

      # bat / delta themes (TextMate .tmTheme)
      (lib.mkIf cfg.bat.enable (
        mkFileEntries "${cfg.package}/share/bat"
          "${config.xdg.configHome}/bat/themes" cfg.bat.variants ".tmTheme"
      ))

      # fzf color snippets
      (lib.mkIf cfg.fzf.enable (
        mkFileEntries "${cfg.package}/share/fzf"
          "${config.xdg.configHome}/fzf" cfg.fzf.variants ".sh"
      ))

      # Yazi flavors
      (lib.mkIf cfg.yazi.enable (
        mkYaziEntries "${cfg.package}/share/yazi"
          "${config.xdg.configHome}/yazi/flavors" cfg.yazi.variants
      ))
    ];
  };
}
