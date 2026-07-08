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
      # Read version from package.json so the theme package and CLI stay in sync.
      packageJson = builtins.fromJSON (builtins.readFile ./package.json);
      version = packageJson.version;

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

        # The senzu CLI, built with tsdown and wrapped for nix.
        senzu-cli = pkgs.buildNpmPackage {
          pname = "senzu";
          inherit version;

          src = ./.;

          npmDepsHash = ""; # set after first build; see README
          dontNpmBuild = true;

          buildPhase = ''
            runHook preBuild
            npx tsdown
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            mkdir -p $out/bin
            cp dist/cli/index.mjs $out/bin/senzu
            chmod +x $out/bin/senzu
            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Canonical color scheme generator CLI";
            license = licenses.mit;
            platforms = platforms.all;
            mainProgram = "senzu";
          };
        };

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
              entry = "${pkgs.nodejs_24}/bin/npx tsc --noEmit";
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
                  ${pkgs.nodejs_24}/bin/npx tsx src/cli/index.ts generate -o . > /dev/null
                  if ! ${pkgs.git}/bin/git diff --exit-code -- share/; then
                    echo "share/ is out of date. Run: pnpm generate"
                    exit 1
                  fi
                '
              '';
              files = "(config\\.json|src/generators/.*\\.ts|src/core/.*\\.ts)";
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
              files = "(package\\.json|pnpm-lock\\.yaml)";
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
          senzu = senzu-cli;
        };

        apps.default = {
          type = "app";
          program = "${senzu-cli}/bin/senzu";
        };

        devShells.default = pkgs.mkShell {
          inherit (pre-commit-check) shellHook;
          packages = with pkgs; [
            nodejs_24
            pnpm
          ];
        };
      }
    );
}
