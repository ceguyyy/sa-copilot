import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { dashboardApi } from '../lib/api'
import { ErrorNote } from './ui'
import './recent-projects.css'
const media = [["https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/167977c6-8539-46b1-9a15-8dba566f50b8.png", "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130045_1a612b69-4854-4b34-8043-ccb91f2c60af.mp4"], ["https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/0446d1d5-e65e-4db5-8090-3e30d09afc43.png", "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130054_dd005674-d693-4d81-80a5-357f7f10b3a3.mp4"], ["https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/da8d0242-4dee-4f6d-813f-a5887e86ad77.png", "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260826_130103_7550f407-f14b-40a6-9616-7a26d7a8bd9f.mp4"]]
export function RecentProjects() {
 const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: dashboardApi.get, refetchInterval: 30000 })
 const projects = [...(dashboard.data ?? [])].sort((a,b)=>new Date(b.last_activity).getTime()-new Date(a.last_activity).getTime()).slice(0,3)
 return <section className="recent-stage" aria-labelledby="recent-projects-heading">
  <header className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-semibold uppercase tracking-wider text-ember">Your workspace, moving forward</p><h2 id="recent-projects-heading" className="mt-1 text-2xl font-semibold">Recent projects</h2></div><Link to="/" className="text-sm text-forest hover:underline">View all projects</Link></header>
  <ErrorNote error={dashboard.error} />
  <div className="grid auto-rows-fr gap-3 md:grid-cols-3">{projects.map((project,index)=><Link key={project.id} to={`/projects/${project.id}`} className={`recent-project recent-project--${index}`} style={{ backgroundImage: `url(${media[index][0]})`, backgroundSize: 'cover' }}>
   <ProjectVideo poster={media[index][0]} src={media[index][1]} />
   <div className="recent-project-content"><div className="flex items-start justify-between gap-2"><span className="rounded-full border border-white/30 bg-white/10 px-2 py-0.5 text-xs capitalize">{project.status}</span><ArrowUpRight className="size-4 shrink-0" /></div><h3 title={project.name} className="mt-3 min-h-[2.5em] line-clamp-2 break-words text-lg font-semibold leading-tight">{project.name}</h3><p className="mt-1 truncate text-sm text-white/85">{project.client_name}</p><div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-white/85"><span>{project.drafted} deliverables drafted</span><span>Active {new Date(project.last_activity).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span></div></div>
  </Link>)}</div>
  {!projects.length && <div className="rounded-xl border border-line bg-panel p-5 text-sm text-muted">{dashboard.isPending?'Loading recent projects...':dashboard.isError?'Recent projects are unavailable.':<>No projects yet. <Link to="/?create=1" className="text-forest underline">Create your first project</Link>.</>}</div>}
 </section>
}

function ProjectVideo({poster,src}:{poster:string;src:string}) {
 const ref=useRef<HTMLVideoElement>(null)
 useEffect(()=>{
  const video=ref.current!;const motion=window.matchMedia('(prefers-reduced-motion: reduce)');let visible=false
  const sync=()=>{if(visible&&!document.hidden&&!motion.matches)void video.play().catch(()=>{});else video.pause()}
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()});observer.observe(video)
  document.addEventListener('visibilitychange',sync);motion.addEventListener('change',sync)
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',sync);motion.removeEventListener('change',sync);video.pause()}
 },[])
 return <video ref={ref} aria-hidden="true" muted loop playsInline preload="none" poster={poster} src={src}/>
}
