import { test, expect } from '@playwright/test';
import { emptyWorkspace, workspaceChanges, mergeWorkspace, WorkspaceConflict } from '../lib/workspace-data';
import { parseBackup } from '../lib/backup';
import { productChatContext } from '../lib/product-chat';
import { emptyPersonalProfile } from '../lib/personal-profile';

test('基本信息按账号保存，拒绝跨账号读取，旧资料可同步且保留教育与技能',async({request,playwright,baseURL})=>{
  const login=await request.post('/api/auth/register',{data:{username:'I'+crypto.randomUUID().replaceAll('-','').slice(0,18),password:'123456'}});expect(login.status()).toBe(201);const {user}=await login.json();const headers={'X-Account-Id':user.id};const initial=await(await request.get('/api/workspace',{headers})).json();
  const profile={...emptyPersonalProfile(),name:'小林',skills:['用户研究','Figma'],education:[{id:'edu',school:'示例大学',major:'工业设计',degree:'本科' as const,startMonth:'2022-09',endMonth:'2026-06'}]};const changes=workspaceChanges(initial.data,{...initial.data,profiles:[profile]});const saved=await request.post('/api/workspace',{headers,data:{requestId:crypto.randomUUID(),revision:initial.revision,changes}});expect(saved.status()).toBe(200);expect((await saved.json()).data.profiles).toEqual([profile]);
  const other=await playwright.request.newContext({baseURL});try{const signup=await other.post('/api/auth/register',{data:{username:'I'+crypto.randomUUID().replaceAll('-','').slice(0,18),password:'123456'}});const second=(await signup.json()).user;expect((await other.get('/api/workspace',{headers:{'X-Account-Id':user.id}})).status()).toBe(401);expect((await(await other.get('/api/workspace',{headers:{'X-Account-Id':second.id}})).json()).data.profiles).toEqual([]);}finally{await other.dispose();}
  const old={...emptyWorkspace()};delete (old as any).profiles;expect(mergeWorkspace(old,old,{...emptyWorkspace(),profiles:[profile]}).profiles).toEqual([profile]);
  expect(productChatContext({...emptyWorkspace(),profiles:[profile]}).personalProfile).toMatchObject({name:'小林',skills:['用户研究','Figma']});
});

test('基本信息备份验证学历日期、单份资料和技能数量，冲突时保留已保存值',()=>{
  const profile={...emptyPersonalProfile(),name:'小林'};const backup={format:'jdtool-backup',version:2,jobs:[],profiles:[profile]};expect(parseBackup(backup).profiles).toEqual([profile]);expect(parseBackup({format:'jdtool-backup',version:1,jobs:[]}).profiles).toEqual([]);
  expect(()=>parseBackup({...backup,profiles:[profile,profile]})).toThrow();expect(()=>parseBackup({...backup,profiles:[{...profile,skills:Array.from({length:51},(_,index)=>String(index))}]})).toThrow();expect(()=>parseBackup({...backup,profiles:[{...profile,education:[{id:'edu',school:'',major:'',degree:'本科',startMonth:'2026-09',endMonth:'2022-06'}]}]})).toThrow();
  const base={...emptyWorkspace(),profiles:[profile]};expect(()=>mergeWorkspace(base,{...base,profiles:[{...profile,name:'本页修改'}]},{...base,profiles:[{...profile,name:'其他页面修改'}]})).toThrow(WorkspaceConflict);
});
