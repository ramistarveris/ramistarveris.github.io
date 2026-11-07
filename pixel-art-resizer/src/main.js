const SCALE_PRESETS = [...Array.from({length:19},(_,i)=>1+i*.5),12,16,20,24,32,48,64,80,100];
const MAX_DIM=16384, MAX_PIXELS=67108864;
const $=s=>document.querySelector(s);
const items=[];
const fileInput=$("#file-input"),drop=$("#drop-zone"),batch=$("#batch-scale"),gallery=$("#gallery"),template=$("#card-template");
const status=message=>$("#status-text").textContent=message;
const fmt=n=>Number.isInteger(n)?String(n):n.toFixed(1);
const size=i=>({width:Math.round(i.width*i.scale),height:Math.round(i.height*i.scale)});
const scales=(w,h)=>{const valid=SCALE_PRESETS.filter(n=>Math.round(w*n)<=MAX_DIM&&Math.round(h*n)<=MAX_DIM&&Math.round(w*n)*Math.round(h*n)<=MAX_PIXELS);return valid.length?valid:[1]};
function options(select,values,selected,w,h){select.replaceChildren();for(const n of values){const o=document.createElement("option");o.value=n;o.textContent="x"+fmt(n)+(w?` (${Math.round(w*n)} x ${Math.round(h*n)})`:"");o.selected=n===selected;select.append(o)}}
function refresh(){
 gallery.replaceChildren();
 for(const i of items){
  const f=template.content.cloneNode(true),card=f.querySelector(".image-card"),out=size(i);
  card.dataset.id=i.id;f.querySelector(".card-name").textContent=i.file.name;
  f.querySelector(".card-info").textContent=(i.file.name.split(".").pop()||"IMAGE").toUpperCase()+" / "+(i.file.size/1024).toFixed(1)+" KB";
  f.querySelector(".source-size").textContent=i.width+" x "+i.height;
  f.querySelector(".output-size").textContent=out.width+" x "+out.height;
  const select=f.querySelector(".scale-select");select.dataset.id=i.id;options(select,i.supportedScales,i.scale,i.width,i.height);
  const canvas=f.querySelector("canvas");canvas.width=out.width;canvas.height=out.height;const ctx=canvas.getContext("2d");ctx.imageSmoothingEnabled=false;ctx.drawImage(i.image,0,0,out.width,out.height);
  gallery.append(f);
 }
 const any=items.length>0;$("#empty-state").hidden=any;$("#gallery-title").textContent=any?items.length+" 件":"画像なし";
 for(const id of ["download-all","clear-all","apply-batch","batch-scale"])$("#"+id).disabled=!any;
}
async function addFiles(files){
 const images=Array.from(files).filter(f=>f.type.startsWith("image/"));if(!images.length){status("画像ファイルだけを読み込めます。");return}
 let failed=0;
 for(const file of images){const url=URL.createObjectURL(file);try{
 const img=await new Promise((ok,err)=>{const x=new Image();x.onload=()=>ok(x);x.onerror=err;x.src=url});
 const supportedScales=scales(img.naturalWidth,img.naturalHeight);
 items.push({id:crypto.randomUUID(),file,image:img,url,width:img.naturalWidth,height:img.naturalHeight,supportedScales,scale:supportedScales.includes(4)?4:supportedScales[Math.min(1,supportedScales.length-1)]});
 }catch(e){failed++;URL.revokeObjectURL(url)}}
 refresh();status((images.length-failed)+" 件の画像を追加しました。"+(failed?failed+" 件は読み込みに失敗しました。":""));
}
function download(i){const out=size(i),c=document.createElement("canvas");c.width=out.width;c.height=out.height;const ctx=c.getContext("2d");ctx.imageSmoothingEnabled=false;ctx.drawImage(i.image,0,0,out.width,out.height);const a=document.createElement("a");a.href=c.toDataURL("image/png");a.download=i.file.name.replace(/\.[^.]+$/,"")+"@x"+fmt(i.scale)+"_"+out.width+"x"+out.height+".png";a.click()}
options(batch,SCALE_PRESETS,4);refresh();
fileInput.addEventListener("change",async e=>{const files=[...e.target.files];e.target.value="";await addFiles(files)});
for(const name of ["dragenter","dragover"])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add("is-active")});
for(const name of ["dragleave","dragend"])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove("is-active")});
drop.addEventListener("drop",async e=>{e.preventDefault();drop.classList.remove("is-active");await addFiles(e.dataTransfer.files)});
$("#apply-batch").addEventListener("click",()=>{let capped=0;for(const i of items){const target=Number(batch.value);if(i.supportedScales.includes(target))i.scale=target;else{i.scale=i.supportedScales.at(-1);capped++}}refresh();status("一括適用しました。"+(capped?capped+" 件は対応上限の倍率に合わせています。":""))});
$("#download-all").addEventListener("click",()=>{items.forEach(download);status(items.length+" 件の PNG 保存を開始しました。")});
$("#clear-all").addEventListener("click",()=>{items.forEach(i=>URL.revokeObjectURL(i.url));items.length=0;refresh();status("画像をすべてクリアしました。")});
gallery.addEventListener("change",e=>{const select=e.target.closest(".scale-select");if(!select)return;const i=items.find(x=>x.id===select.dataset.id);if(!i)return;i.scale=Number(select.value);refresh();status(i.file.name+" を x"+fmt(i.scale)+" に更新しました。")});
gallery.addEventListener("click",e=>{const b=e.target.closest("button[data-action]");if(!b)return;const i=items.find(x=>x.id===b.closest(".image-card")?.dataset.id);if(!i)return;if(b.dataset.action==="download"){download(i);status(i.file.name+" の保存を開始しました。")}else{URL.revokeObjectURL(i.url);items.splice(items.indexOf(i),1);refresh();status(i.file.name+" をリストから外しました。")}});
