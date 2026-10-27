{
  description = "senzu - canonical color scheme generator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    let
      # Read version from the CLI package so the themes package and CLI stay in sync.
      cliPackageJson = builtins.fromJSON (builtins.readFile ./packages/cli/package.json);
      version = cliPackageJson.version;

      herdrThemeDirectory = builtins.readDir ./share/herdr;
      herdrThemeFiles = builtins.filter (
        name:
        herdrThemeDirectory.${name} == "regular"
        && builtins.match ".*[.]toml" name != null
      ) (builtins.attrNames herdrThemeDirectory);
      herdrThemes = builtins.listToAttrs (
        map (
          fileName:
          let
            variant = builtins.substring 0 (builtins.stringLength fileName - 5) fileName;
            document = builtins.fromTOML (builtins.readFile (./share/herdr + "/${fileName}"));
          in
          {
            name = variant;
            value = document.theme;
          }
        ) herdrThemeFiles
      );

      systemIndependent = {
        lib = {
          # Parsed `[theme]` tables per variant. Dark variant files pair the
          # variant with its `-light` counterpart and enable auto_switch, so
          # the attrset carries theme.custom.{shared,dark,light} colors.
          # Light variant files are single-appearance.
          inherit herdrThemes;
          herdrTheme = variant:
            herdrThemes.${variant} or (throw ''
              Unknown Senzu Herdr variant "${variant}".
              Available variants: ${builtins.concatStringsSep ", " (builtins.attrNames herdrThemes)}
            '');
        };

        homeManagerModules = {
          default = import ./nix/home-manager.nix;
          senzu = import ./nix/home-manager.nix;
        };
      };

      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      # Prebuilt senzu-appearance binaries, built by the release workflow and
      # attached to the GitHub release. Consumers download instead of
      # compiling: a Rust toolchain on every machine, for one small binary,
      # every time the input moves, is not a good trade.
      #
      # The marker comments are load-bearing: .github/workflows/version.yml
      # rewrites the version and the hashes together after each release. Do
      # not reformat them.
      #
      # This version is deliberately not `version` above. That one moves with
      # the release commit, while the binaries only exist once the build job
      # has uploaded them; pinning them separately keeps every commit pointing
      # at a release that actually has assets.
      appearanceVersion = "0.12.0"; # appearance-version

      # What the hashes hold until a release has uploaded binaries. While they
      # are still placeholders the flake builds from source instead of
      # fetching something that does not exist.
      appearancePlaceholder = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

      appearanceBinaries = {
        "aarch64-darwin" = {
          suffix = "darwin-arm64";
          hash = "sha256-07LAsugv1PNmDhrEkbehTHphFPpgyW0JjWM3hWjcEqM="; # darwin
        };
        "aarch64-linux" = {
          suffix = "linux-arm64";
          hash = "sha256-vWDZrA16+2d+manKpXTPyScoygpHhCthL5QWeAyOrD0="; # linux-arm64
        };
        "x86_64-linux" = {
          suffix = "linux-x64";
          hash = "sha256-JqOXdhvjjPExVCv8s6wHbNCFohcNLP2MwV26HxVmK6M="; # linux-x64
        };
      };
    in
    systemIndependent
    // flake-utils.lib.eachSystem systems (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # The generated theme files (share/), consumed by the home-manager module.
        themes = pkgs.stdenv.mkDerivation {
          pname = "senzu-themes";
          inherit version;

          src = ./share;

          dontBuild = true;

          installPhase = ''
            mkdir -p $out/share
            cp -r * $out/share/
          '';

          meta = with pkgs.lib; {
            description = "Generated Senzu color schemes for terminal and editor applications";
            license = licenses.mit;
            platforms = platforms.all;
          };
        };

        # Terminal appearance probe. The only component allowed to query the
        # tty; see docs/appearance-detection.md.
        #
        # Built from source: for development, and the fallback when a release
        # has no binary for a platform. `cargo test` runs in the build,
        # including the pty tests.
        appearance-source = pkgs.rustPlatform.buildRustPackage {
          pname = "senzu-appearance";
          inherit version;

          src = ./native;

          cargoLock.lockFile = ./native/Cargo.lock;

          meta = with pkgs.lib; {
            description = "Terminal appearance probe for Senzu";
            license = licenses.mit;
            mainProgram = "senzu-appearance";
            platforms = platforms.unix;
          };
        };

        # The released binary. Linux builds are static musl, so there is no
        # interpreter to patch and they run on NixOS as-is.
        appearance-binary =
          let
            binary =
              appearanceBinaries.${system}
                or (throw "senzu-appearance: no prebuilt binary for ${system}; use .#appearance-source");
          in
          pkgs.stdenv.mkDerivation {
            pname = "senzu-appearance";
            version = appearanceVersion;

            src = pkgs.fetchurl {
              url = "https://github.com/aliou/senzu/releases/download/v${appearanceVersion}/senzu-appearance-${binary.suffix}";
              inherit (binary) hash;
            };

            dontUnpack = true;

            installPhase = ''
              install -Dm755 $src $out/bin/senzu-appearance
            '';

            meta = with pkgs.lib; {
              description = "Terminal appearance probe for Senzu (prebuilt)";
              license = licenses.mit;
              mainProgram = "senzu-appearance";
              platforms = builtins.attrNames appearanceBinaries;
            };
          };

        # Live `senzu` bin for the devShell: runs the CLI through tsx against the
        # working tree so edits to generators/config take effect immediately.
        senzu-dev = pkgs.writeShellScriptBin "senzu" ''
          root="$(${pkgs.git}/bin/git rev-parse --show-toplevel 2>/dev/null)"
          entry="$root/packages/cli/src/cli/index.ts"
          if [ -z "$root" ] || [ ! -f "$entry" ]; then
            echo "senzu: not inside the senzu repo" >&2
            exit 1
          fi
          tsx="$root/node_modules/.bin/tsx"
          if [ ! -x "$tsx" ]; then
            echo "senzu: tsx missing - run 'pnpm install' in $root" >&2
            exit 1
          fi
          exec "$tsx" "$entry" "$@"
        '';

      in
      {
        packages = {
          default = themes;
          themes = themes;

          # Download when a release has published binaries for this system,
          # compile otherwise. Nothing to switch by hand: the release workflow
          # fills in the hashes.
          appearance =
            if (appearanceBinaries.${system}.hash or appearancePlaceholder) == appearancePlaceholder then
              appearance-source
            else
              appearance-binary;
          appearance-binary = appearance-binary;
          appearance-source = appearance-source;
        };

        devShells.default = pkgs.mkShell {
          # Install the lefthook git hooks (lefthook.yml) on entry.
          shellHook = ''
            ${pkgs.lefthook}/bin/lefthook install
          '';
          packages = with pkgs; [
            nodejs_24
            pnpm
            senzu-dev
            just
            lefthook
            jq
          ];
        };
      }
    );
}
