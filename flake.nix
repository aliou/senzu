{
  description = "senzu - canonical color scheme generator";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    git-hooks = {
      url = "github:cachix/git-hooks.nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      git-hooks,
    }:
    let
      # Read version from the CLI package so the themes package and CLI stay in sync.
      cliPackageJson = builtins.fromJSON (builtins.readFile ./packages/cli/package.json);
      version = cliPackageJson.version;

      systemIndependent = {
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

        pre-commit-check = git-hooks.lib.${system}.run {
          src = ./.;
          hooks = {
            # Format and lint check.
            biome-check = {
              enable = true;
              name = "biome check";
              entry = "${pkgs.nodejs_24}/bin/npx biome check";
              files = "\\.(ts|json)$";
              pass_filenames = false;
            };
            # Typecheck.
            typecheck = {
              enable = true;
              name = "typecheck";
              entry = "${pkgs.nodejs_24}/bin/npx tsc -p packages/cli --noEmit";
              files = "\\.ts$";
              pass_filenames = false;
            };
            # Regenerate themes and fail if share/ would change (keeps generated output in sync).
            themes-up-to-date = {
              enable = true;
              name = "themes up to date";
              entry = ''
                ${pkgs.bash}/bin/bash -c '
                  set -e
                  ${pkgs.nodejs_24}/bin/npx tsx packages/cli/src/cli/index.ts generate -o . > /dev/null
                  if ! ${pkgs.git}/bin/git diff --exit-code -- share/; then
                    echo "share/ is out of date. Run: pnpm generate"
                    exit 1
                  fi
                '
              '';
              files = "(config\\.json|packages/cli/src/generators/.*\\.ts|packages/cli/src/core/.*\\.ts)";
              pass_filenames = false;
            };
            # Fail if pnpm-lock.yaml is out of date.
            lockfile-up-to-date = {
              enable = true;
              name = "pnpm-lock.yaml up to date";
              entry = ''
                ${pkgs.bash}/bin/bash -c '
                  set -e
                  ${pkgs.nodejs_24}/bin/npm exec -- pnpm install --frozen-lockfile --ignore-scripts
                '
              '';
              files = "(package\\.json|pnpm-lock\\.yaml|pnpm-workspace\\.yaml)";
              pass_filenames = false;
            };
          };
        };
      in
      {
        checks = {
          pre-commit-check = pre-commit-check;
        };

        packages = {
          default = themes;
          themes = themes;
        };

        devShells.default = pkgs.mkShell {
          inherit (pre-commit-check) shellHook;
          packages = with pkgs; [
            nodejs_24
            pnpm
            senzu-dev
          ];
        };
      }
    );
}
