// بسيط: ينشئ ملف ICO من BMP مصغرة (حل مؤقت). يفضل لاحقاً استبداله بأيقونة احترافية.
const fs = require('fs');
const path = require('path');

function buildBmp(size, colorFn){
  const rowSize = size*4;
  const pixelDataSize = rowSize*size;
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const bmpSize = fileHeaderSize + infoHeaderSize + pixelDataSize;
  const bmp = Buffer.alloc(bmpSize);
  const pixels = Buffer.alloc(size*size*4);
  for(let y=0;y<size;y++){
    for(let x=0;x<size;x++){
      const i = y*size + x;
      const {r,g,b,a} = colorFn(x,y,size);
      pixels[i*4+0]=b; pixels[i*4+1]=g; pixels[i*4+2]=r; pixels[i*4+3]=a;
    }
  }
  bmp.write('BM',0,2,'ascii');
  bmp.writeUInt32LE(bmpSize,2);
  bmp.writeUInt32LE(0,6);
  bmp.writeUInt32LE(fileHeaderSize+infoHeaderSize,10);
  bmp.writeUInt32LE(40,14);
  bmp.writeInt32LE(size,18);
  bmp.writeInt32LE(size*2,22);
  bmp.writeUInt16LE(1,26);
  bmp.writeUInt16LE(32,28);
  bmp.writeUInt32LE(0,30);
  bmp.writeUInt32LE(pixelDataSize,34);
  bmp.writeInt32LE(0,38);
  bmp.writeInt32LE(0,42);
  bmp.writeUInt32LE(0,46);
  bmp.writeUInt32LE(0,50);
  for(let y=0;y<size;y++){
    const srcStart = (size -1 - y)*rowSize;
    pixels.copy(bmp, fileHeaderSize+infoHeaderSize + y*rowSize, srcStart, srcStart+rowSize);
  }
  const andMask = Buffer.alloc((size*size)/8,0x00);
  return Buffer.concat([bmp,andMask]);
}

function createPlaceholderICO(output){
  const sizes = [256,128,64,48,32,16];
  const images = sizes.map(sz => buildBmp(sz,(x,y,size)=>{
    // تدرج لوني بسيط + حرف H مبسط في المركز (لون مختلف)
    const cx=size/2, cy=size/2;
    const dx=Math.abs(x-cx), dy=Math.abs(y-cy);
    const baseR=0x16, baseG=0x7A, baseB=0xE3;
    let r=baseR, g=baseG, b=baseB;
    if(dx < size*0.18 && dy < size*0.38){ // عمود
      r=0xFF; g=0xD7; b=0x30;
    }
    if(dy < size*0.18 && dx < size*0.38){ // عارضة
      r=0xFF; g=0xD7; b=0x30;
    }
    return {r,g,b,a:0xFF};
  }));
  const dirHeader = Buffer.alloc(6);
  dirHeader.writeUInt16LE(0,0);
  dirHeader.writeUInt16LE(1,2);
  dirHeader.writeUInt16LE(images.length,4);
  const entries = [];
  let offset = 6 + images.length*16;
  images.forEach((img,i)=>{
    const size = sizes[i];
    const e = Buffer.alloc(16);
    e.writeUInt8(size===256?0:size,0);
    e.writeUInt8(size===256?0:size,1);
    e.writeUInt8(0,2);
    e.writeUInt8(0,3);
    e.writeUInt16LE(1,4);
    e.writeUInt16LE(32,6);
    e.writeUInt32LE(img.length,8);
    e.writeUInt32LE(offset,12);
    offset += img.length;
    entries.push(e);
  });
  const ico = Buffer.concat([dirHeader, ...entries, ...images]);
  fs.writeFileSync(output, ico);
}

const outPath = path.join(__dirname,'..','assets','icon.ico');
createPlaceholderICO(outPath);
console.log('Generated placeholder icon at', outPath);
