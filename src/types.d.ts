declare module '*.vert' {
  const content: string;
  export default content;
}
declare module '*.frag' {
  const content: string;
  export default content;
}

declare module '*.wgsl' {
  const src: string;
  export default src;
}

declare module '*.wgsl?raw' {
  const source: string;
  export default source;
}