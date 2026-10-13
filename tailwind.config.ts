import type { Config } from "tailwindcss";
export default { darkMode:"class",content:["./app/**/*.{ts,tsx}","./components/**/*.{ts,tsx}","./features/**/*.{ts,tsx}"],theme:{extend:{colors:{brand:{50:"#eefbf5",100:"#d7f5e7",500:"#19a974",600:"#12845b",700:"#106a4b"}},boxShadow:{soft:"0 1px 2px rgba(0,0,0,.03),0 8px 30px rgba(0,0,0,.04)"}}},plugins:[]} satisfies Config;
