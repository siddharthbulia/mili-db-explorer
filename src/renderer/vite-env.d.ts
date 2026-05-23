/// <reference types="vite/client" />

declare module '*?worker' {
  const ctor: new () => Worker;
  export default ctor;
}
