import type { RoutableProps } from "preact-router";

declare module "preact" {
  namespace JSX {
    interface IntrinsicAttributes extends RoutableProps {}
  }
}
