{
  config,
  lib,
  inputs ? null,
  pkgs ? config.nixpkgs.pkgs or (throw "nixpkgs instance required"),
  ...
}:
let
  cfg = config.programs.senzu;

  # Automatically derive the themes package from the flake input.
  defaultThemesPackage =
    if inputs != null && inputs ? senzu then
      inputs.senzu.packages.${pkgs.system}.themes
    else
      null;

  # The appearance probe: the only component allowed to query the terminal.
  defaultAppearancePackage =
    if inputs != null && inputs ? senzu then
      inputs.senzu.packages.${pkgs.system}.appearance
    else
      null;

  # Install every file of a generated target directory. Enumerating the
  # store path at eval time (no IFD) means new variants and targets show up
  # without any list to maintain.
  mkTargetEntries = target: destDir:
    lib.mapAttrs'
      (name: _:
        lib.nameValuePair "${destDir}/${name}" {
          source = "${cfg.package}/share/${target}/${name}";
        })
      (builtins.readDir "${cfg.package}/share/${target}");
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

    # Variants used by tools that follow the terminal's appearance. Tools read
    # SENZU_VARIANT (exported by the shell hook); bat, delta and fzf setups
    # reference these names when mapping dark/light.
    darkVariant = lib.mkOption {
      type = lib.types.str;
      default = "senzu";
      description = "Senzu variant used in dark mode (bat theme name / fzf snippet).";
    };

    lightVariant = lib.mkOption {
      type = lib.types.str;
      default = "senzu-light";
      description = "Senzu variant used in light mode (bat theme name / fzf snippet).";
    };

    shell = {
      enable = lib.mkEnableOption "appearance shell hook and compatibility shim" // { default = true; };
      # Hand-maintained support files (not generator output). Installed to a
      # stable path so consumers can source them without referencing the nix
      # store. See docs/appearance-detection.md.
    };

    appearance = {
      enable = lib.mkEnableOption "senzu-appearance terminal probe" // { default = true; };

      package = lib.mkOption {
        type = lib.types.nullOr lib.types.package;
        default = defaultAppearancePackage;
        description = ''
          The senzu-appearance probe. Queries the terminal background with
          OSC 11 under a lock with echo disabled, and caches the answer.

          Only the shell hook should run it. Tools (bat, delta, fzf) read the
          variant from the environment the hook exports; a tool that probes on
          every invocation echoes the terminal's reply into your output.
        '';
      };
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = lib.optional (cfg.appearance.enable && cfg.appearance.package != null)
      cfg.appearance.package;

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
      # Ghostty themes (no extension, installed under themes/)
      (mkTargetEntries "ghostty" "${config.xdg.configHome}/ghostty/themes")

      # Lazygit theme overrides
      (mkTargetEntries "lazygit" "${config.xdg.configHome}/lazygit")

      # Neovim colorschemes (as opt plugin in pack path)
      (mkTargetEntries "neovim" "${config.xdg.dataHome}/nvim/site/pack/senzu/opt/senzu/colors")

      # Zed theme family (single file containing all variants)
      (mkTargetEntries "zed" "${config.home.homeDirectory}/.config/zed/themes")

      # Pi coding agent themes
      (mkTargetEntries "pi" "${config.xdg.configHome}/pi/themes")

      # bat / delta themes (TextMate .tmTheme)
      (mkTargetEntries "bat" "${config.xdg.configHome}/bat/themes")

      # fzf color snippets
      (mkTargetEntries "fzf" "${config.xdg.configHome}/fzf")

      # Yazi flavors (directories named <variant>.yazi)
      (mkTargetEntries "yazi" "${config.xdg.configHome}/yazi/flavors")

      # Appearance hook and compatibility shim. Source the hook from your zsh
      # config to keep bat, delta and fzf on the current variant:
      #
      #   export SENZU_SHARE_DIR=${cfg.package}/share
      #   source ${config.xdg.configHome}/senzu/senzu-hook.zsh
      (lib.mkIf cfg.shell.enable {
        "${config.xdg.configHome}/senzu/senzu-hook.zsh".source =
          "${cfg.package}/share/shell/senzu-hook.zsh";
        "${config.xdg.configHome}/senzu/senzu-appearance.sh".source =
          "${cfg.package}/share/shell/senzu-appearance.sh";
      })
    ];
  };
}
