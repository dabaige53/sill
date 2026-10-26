declare module "*.html" {
	const value: string;
	export default value;
}
declare module "*.png" {
	const value: Uint8Array<ArrayBuffer>;
	export default value;
}
declare module "*.svg" {
	const value: string;
	export default value;
}
interface Window {
	[key: string]: any;
}
declare const __app: any;
declare const __store: any;
declare module "*.css";
