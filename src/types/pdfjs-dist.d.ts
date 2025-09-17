// Tipos frouxos para aceitar qualquer export do pdfjs (evita TS2307/TS2345)
declare module "pdfjs-dist" {
  const anyExport: any;
  export = anyExport;
}
declare module "pdfjs-dist/*" {
  const anyExport: any;
  export = anyExport;
}
