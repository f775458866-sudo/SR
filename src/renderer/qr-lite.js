/* Minimal QR Code generator (byte mode only) supporting versions 1-10 and EC levels L,M,Q.
   Based on QR specification concepts. Single dependency-free implementation.
   MIT License: Copyright (c) 2025
*/
(function(global){
  const GF_EXP=new Array(512), GF_LOG=new Array(256);(function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11d;}for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
  function gfMul(a,b){if(a===0||b===0)return 0;return GF_EXP[(GF_LOG[a]+GF_LOG[b])%255];}
  function gfPow(a,e){let r=1;for(let i=0;i<e;i++)r=gfMul(r,a);return r;}
  function polyMul(p,q){const r=new Array(p.length+q.length-1).fill(0);for(let i=0;i<p.length;i++)for(let j=0;j<q.length;j++)r[i+j]^=gfMul(p[i],q[j]);return r;}
  function rsGen(ec){let poly=[1];for(let i=0;i<ec;i++)poly=polyMul(poly,[1,gfPow(2,i)]);return poly;}
  function polyMod(msg,gen){let res=msg.slice();for(let i=0;i<msg.length-(gen.length-1);i++){const coef=res[i];if(coef!==0){for(let j=1;j<gen.length;j++)res[i+j]^=gfMul(gen[j],coef);}}return res.slice(res.length-(gen.length-1));}
  // Alignment pattern centers per version (1..10) (from spec)
  const ALIGN={1:[],2:[6,18],3:[6,22],4:[6,26],5:[6,30],6:[6,34],7:[6,22,38],8:[6,24,42],9:[6,26,46],10:[6,28,50]};
  const SIZE=v=>17+4*v;
  // Total data capacity (bytes) for byte mode (approx, data codewords) for levels L,M,Q versions 1-10
  const CAP={
    L:{1:19,2:34,3:55,4:80,5:108,6:136,7:156,8:194,9:232,10:274},
    M:{1:16,2:28,3:44,4:64,5:86,6:108,7:124,8:154,9:182,10:216},
    Q:{1:13,2:22,3:34,4:48,5:62,6:76,7:88,8:110,9:132,10:154}
  };
  // Error correction codewords per block & block counts (simplified mapping) (version 1-10, levels L,M,Q) from standard tables
  const EC_TABLE={
    L:{1:{ec:7,blocks:[{data:19}]} ,2:{ec:10,blocks:[{data:34}]} ,3:{ec:15,blocks:[{data:55}]} ,4:{ec:20,blocks:[{data:80}]},5:{ec:26,blocks:[{data:108}]},6:{ec:18,blocks:[{data:68},{data:68}]},7:{ec:20,blocks:[{data:78},{data:78}]},8:{ec:24,blocks:[{data:97},{data:97}]},9:{ec:30,blocks:[{data:116},{data:116}]},10:{ec:18,blocks:[{data:68},{data:69},{data:69},{data:68}]}}
   ,M:{1:{ec:10,blocks:[{data:16}]} ,2:{ec:16,blocks:[{data:28}]} ,3:{ec:26,blocks:[{data:44}]} ,4:{ec:36,blocks:[{data:64}]} ,5:{ec:48,blocks:[{data:86}]},6:{ec:64,blocks:[{data:108}]},7:{ec:72,blocks:[{data:124}]},8:{ec:86,blocks:[{data:154}]},9:{ec:100,blocks:[{data:182}]},10:{ec:118,blocks:[{data:216}]}}
   ,Q:{1:{ec:13,blocks:[{data:13}]} ,2:{ec:22,blocks:[{data:22}]} ,3:{ec:36,blocks:[{data:34}]} ,4:{ec:52,blocks:[{data:48}]} ,5:{ec:72,blocks:[{data:62}]},6:{ec:96,blocks:[{data:76}]},7:{ec:108,blocks:[{data:88}]},8:{ec:132,blocks:[{data:110}]},9:{ec:156,blocks:[{data:132}]},10:{ec:180,blocks:[{data:154}]}}
  };
  function encode(data){ return new TextEncoder().encode(data); }
  function buildCodewords(dataBytes, level){
    for(let v=1; v<=10; v++){
      if(dataBytes.length <= CAP[level][v]-2){ // reserve mode+len
        // Build bit stream
        let bits=[]; const push=(val,len)=>{for(let i=len-1;i>=0;i--) bits.push((val>>i)&1);} ;
        push(0b0100,4); // byte mode
        push(dataBytes.length, (v>=10? 16:8)); // simple: use 8 bits for versions <10, else 16 (approx)
        for(const b of dataBytes) push(b,8);
        // Terminator
        for(let t=0;t<4 && bits.length%8!==0;t++) bits.push(0);
        while(bits.length%8!==0) bits.push(0);
        const table=EC_TABLE[level][v];
        // Assemble single block(s) (simplified: we assume one block per entry)
        let codewords=[]; for(let i=0;i<bits.length;i+=8){ let b=0; for(let j=0;j<8;j++) b=(b<<1)|bits[i+j]; codewords.push(b);} 
        // pad to total data codewords
        const totalData = table.blocks.reduce((s,b)=>s+b.data,0);
        const pad=[0xEC,0x11]; let pi=0; while(codewords.length<totalData){ codewords.push(pad[pi%2]); pi++; }
        // For each block generate ec
        let allBlocks=[]; let ecBlocks=[]; let offset=0; const ecLen=table.ec; const gen=rsGen(ecLen);
        for(const blk of table.blocks){ const slice=codewords.slice(offset, offset+blk.data); offset+=blk.data; const ec=polyMod(slice.concat(new Array(ecLen).fill(0)), gen); allBlocks.push(slice); ecBlocks.push(ec); }
        // Interleave (single block case trivial)
        let interleaved=[]; for(let i=0;i<totalData;i++){ for(const b of allBlocks){ if(i<b.length) interleaved.push(b[i]); } }
        for(let i=0;i<ecLen;i++){ for(const e of ecBlocks){ interleaved.push(e[i]); } }
        return {version:v, level, codewords:interleaved};
      }
    }
    throw new Error('DATA_TOO_LONG');
  }
  function place(v, level, codewords){ const size=SIZE(v); const m=Array.from({length:size},()=>Array(size).fill(null));
    function finder(r,c){ for(let i=0;i<7;i++)for(let j=0;j<7;j++){ const edge=i===0||i===6||j===0||j===6; const core=i>=2&&i<=4&&j>=2&&j<=4; m[r+i][c+j]=(edge||core)?1:0; }}
    finder(0,0); finder(0,size-7); finder(size-7,0);
    for(let i=0;i<size;i++){ if(m[6][i]==null)m[6][i]=i%2===0?1:0; if(m[i][6]==null)m[i][6]=i%2===0?1:0; }
    // Alignment patterns
    const centers=ALIGN[v]||[]; for(const r of centers){ for(const c of centers){ if((r===6 && (c===6||c===size-7)) || (c===6 && (r===6||r===size-7))) continue; if(r<0||c<0||r+4>=size||c+4>=size) continue; if(m[r][c]!=null) continue; for(let i=0;i<5;i++)for(let j=0;j<5;j++){ const edge=i===0||i===4||j===0||j===4; m[r+i][c+j]=edge|| (i===2 && j===2)?1:0; }} }
    // Reserve format areas
    for(let i=0;i<9;i++){ if(i!==6){ m[i][8]=0; m[8][i]=0; m[size-1-i][8]=0; m[8][size-1-i]=0; }}
    m[size-8][8]=1; // dark module (approx spec)
    // Data placement
    let dirUp=true; let col=size-1; let bitIndex=0; const totalBits=codewords.length*8; const getBit=ci=>{ const b=codewords[Math.floor(ci/8)]; return (b>>(7-(ci%8)))&1; };
    while(col>0){ if(col===6) col--; for(let rIter=0;rIter<size;rIter++){ const r=dirUp? size-1-rIter : rIter; for(let cOff=0;cOff<2;cOff++){ const c=col-cOff; if(m[r][c]==null){ const bit= bitIndex<totalBits? getBit(bitIndex):0; bitIndex++; m[r][c]= bit ^ ((r+c)%2===0?1:0); } } } col-=2; dirUp=!dirUp; }
    // Format info (assume mask 0, map EC level bits) level bits: L=01, M=00, Q=11
    const EC_BITS={L:0b01,M:0b00,Q:0b11}; let ec=EC_BITS[level]; let fmt=(ec<<3)|0; // mask 0
    let val=fmt<<10; const poly=0b10100110111; for(let i=14;i>=10;i--){ if((val>>i)&1) val ^= (poly<<(i-10)); } let f=(fmt<<10)| (val & 0x3FF); f ^= 0b101010000010010; 
    for(let i=0;i<15;i++){ const bit=(f>>i)&1; // vertical
      if(i<6) m[i][8]=bit; else if(i===6) m[i+1][8]=bit; else if(i<8) m[size-15+i][8]=bit; else m[8][14-i]=bit; // horizontal
      if(i<8) m[8][size-1-i]=bit; else if(i<9) m[8][15-i]=bit; else m[14-i][8]=bit; }
    return m; }
  function toSvg(mat,scale){ const n=mat.length; let svg=`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${n} ${n}' width='${n*scale}' height='${n*scale}' shape-rendering='crispEdges'>`+"<rect width='100%' height='100%' fill='#fff'/>"; for(let r=0;r<n;r++) for(let c=0;c<n;c++) if(mat[r][c]) svg+=`<rect x='${c}' y='${r}' width='1' height='1' fill='#000'/>`; return svg+="</svg>"; }
  function generateQR(data, opts={level:'Q',scale:3}){ const bytes=typeof data==='string'? encode(data): data; const levels=['Q','M','L']; for(const lv of levels){ try { const {version,codewords}=buildCodewords(bytes, lv); const mat=place(version, lv, codewords); return toSvg(mat, opts.scale||3);} catch(e){ if(e.message!=='DATA_TOO_LONG') throw e; } } throw new Error('QR_UNSUPPORTED_LENGTH'); }
  global.__qrLite = { generateQR };
})(window);
