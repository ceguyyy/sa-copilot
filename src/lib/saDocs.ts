import DOMPurify from 'dompurify'
export function sanitizeSaDocs(html:string){
 const clean=DOMPurify.sanitize(html,{ALLOWED_TAGS:['p','div','span','br','b','strong','i','em','u','s','strike','ul','ol','li','h1','h2','h3','h4','blockquote','pre','code','table','thead','tbody','tr','td','th','font','a'],ALLOWED_ATTR:['style','color','size','face','href','target','rel']})
 const doc=new DOMParser().parseFromString(clean,'text/html')
 for(const element of doc.querySelectorAll<HTMLElement>('[style]')){
  const permitted=['font-family','font-size','font-weight','font-style','color','text-decoration','text-align','vertical-align']
  const style=element.style,values=permitted.map(key=>[key,style.getPropertyValue(key)] as const)
  element.removeAttribute('style')
  for(const [key,value] of values)if(value&&!/url\s*\(|expression\s*\(/i.test(value))element.style.setProperty(key,value)
 }
 for(const link of doc.querySelectorAll('a'))link.setAttribute('rel','noopener noreferrer')
 return doc.body.innerHTML
}
