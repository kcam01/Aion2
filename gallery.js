import {validateManifest,filterImages} from "./gallery-data.js";
const get=id=>document.getElementById(id);
const grid=get("gallery-grid"),viewer=get("gallery-viewer"),fullImage=get("viewer-image");
let images=[],visible=[],position=0,returnFocus=null,loading=false;
function state(title,detail,{retry=false}={}){get("gallery-state").hidden=false;get("gallery-state-title").textContent=title;get("gallery-state-detail").textContent=detail;get("gallery-retry").hidden=!retry;}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function card(item,index){
 const article=element("article","gallery-card"),button=element("button","gallery-image-button");
 button.type="button";button.setAttribute("aria-label","Enlarge image");
 const img=element("img");img.alt=item.description||item.title;img.width=item.width;img.height=item.height;img.loading=index<3?"eager":"lazy";img.decoding="async";
 img.addEventListener("error",()=>{img.hidden=true;button.append(element("span","gallery-image-failure","Preview unavailable · Open image"));},{once:true});
 img.src=item.thumbnail;button.append(img);button.addEventListener("click",()=>{returnFocus=button;position=index;showImage();viewer.showModal();});
 article.append(button);return article;
}
function render(){
 visible=filterImages(images,"","newest");grid.replaceChildren();const count=visible.length;
 get("gallery-state").hidden=count>0;
 if(!count){state("No images yet.","");return;}
 const fragment=document.createDocumentFragment();visible.forEach((item,index)=>fragment.append(card(item,index)));grid.append(fragment);
}

async function load(){
 if(loading)return;loading=true;grid.setAttribute("aria-busy","true");grid.replaceChildren();state("Opening the collection…","Gathering the latest character images.");
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
 try{const response=await fetch("/gallery.json",{signal:controller.signal,cache:"no-cache"});if(!response.ok)throw Error("Unavailable");images=validateManifest(await response.json()).images;render();}
 catch{images=[];visible=[];state("The gallery couldn’t load.","Please try again in a moment.",{retry:true});}
 finally{clearTimeout(timeout);loading=false;grid.setAttribute("aria-busy","false");}
}
function showImage(){
 const item=visible[position];if(!item)return;
 get("viewer-prev").disabled=visible.length<2;get("viewer-next").disabled=visible.length<2;
 fullImage.hidden=true;fullImage.alt=item.description||item.title;get("viewer-status").hidden=false;get("viewer-status").textContent="Loading image…";
 fullImage.onload=()=>{fullImage.hidden=false;get("viewer-status").hidden=true;};
 fullImage.onerror=()=>{fullImage.hidden=true;get("viewer-status").hidden=false;get("viewer-status").textContent="This image couldn’t load. Try another image.";};
 fullImage.src=item.image;
}
function move(delta){if(visible.length<2)return;position=(position+delta+visible.length)%visible.length;showImage();}
get("gallery-retry").addEventListener("click",load);
get("viewer-close").addEventListener("click",()=>viewer.close());get("viewer-prev").addEventListener("click",()=>move(-1));get("viewer-next").addEventListener("click",()=>move(1));
viewer.addEventListener("keydown",event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();move(event.key==="ArrowLeft"?-1:1);}});
viewer.addEventListener("click",event=>{if(event.target===viewer){const box=viewer.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)viewer.close();}});
viewer.addEventListener("close",()=>{fullImage.onload=null;fullImage.onerror=null;fullImage.removeAttribute("src");if(returnFocus?.isConnected)returnFocus.focus();});
load();
