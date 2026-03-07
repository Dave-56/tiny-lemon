declare module "*.css";

// Shopify App Bridge web components
declare namespace JSX {
  interface IntrinsicElements {
    's-app-nav': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    's-link': React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLElement>, HTMLElement> & { href?: string };
    's-page': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { heading?: string };
  }
}
