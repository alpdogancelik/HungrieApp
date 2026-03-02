export * from "./src/domain/types";

declare module "*.png" { const value: any; export default value }
declare module "*.jpg" { const value: any; export default value }
declare module "*.jpeg" { const value: any; export default value }
declare module "*.gif" { const value: any; export default value }
declare module "*.svg" {
    import type { FC, SVGProps } from "react";
    const content: FC<SVGProps<SVGSVGElement>>;
    export default content;
}
declare module "*.json" { const value: any; export default value }

declare module "expo-image/src/utils/resolveHashString" {
    const resolveHashString: (input: any) => string;
    export default resolveHashString;
}
