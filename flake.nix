{
  description = "Calendar app development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = false;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          name = "calendar-dev";

          buildInputs = with pkgs; [
            nodejs_24
            pnpm
            biome
          ];

          shellHook = ''
            echo "calendar dev shell"
            echo "  just start  - start dev server"
            echo "  just stop   - stop dev server"
            echo "  just format - format code"
            echo "  just test   - run tests"
          '';
        };
      });
}
