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

// Silence editor complaints from expo-image internal utils when TS scans node_modules.
declare module "expo-image/src/utils/resolveAssetSource" {
    const resolveAssetSource: (source: any) => any;
    export default resolveAssetSource;
}
declare module "expo-image/src/utils/resolveHashString" {
    const resolveHashString: (input: any) => string;
    export default resolveHashString;
}
