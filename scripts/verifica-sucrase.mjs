import { transform } from "sucrase";
const fonte = `import X from "./a.jsx";
import { useState } from "react";
export default function P(){ const [v] = useState(1); return <div className="x"><X v={v}/></div>; }`;
const r = transform(fonte, { transforms: ["jsx", "imports"], production: true });
console.log(r.code);
