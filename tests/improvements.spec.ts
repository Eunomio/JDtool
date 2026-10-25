import { test, expect, navigate, type Page } from './fixtures';
const now = '2026-10-25T08:00:00.000Z';
const job = { id:'improve-job',title:'产品经理',company:'星桥协作',content:'负责用户访谈、需求分析及产品方案验证。',requirements:[{id:'improve-r1',text:'开展用户访谈',sourceText:'开展用户访谈'},{id:'improve-r2',text:'安排产品方案验证',sourceText:'安排产品方案验证'}],responsibilities:[],status:'关注中',nextAction:'',createdAt:now,updatedAt:now };
const project = { id:'improve-project',name:'活动报名工具',type:'课程项目',stage:'已测试',timeline:'',role:'产品设计',problem:'',actions:'',methods:'',results:'',skills:[],facts:[{id:'improve-f1',text:'访谈活动参与者并整理报名问题',sourceText:'访谈活动参与者并整理报名问题',category:'action'}],sources:[],confirmed:true,visibility:'private',redactions:[],updatedAt:now };
const recommendation = { projectId:project.id,rank:1,role:'primary',matchType:'direct',requirementIds:['improve-r1'],factIds:['improve-f1'],reason:'有用户访谈事实支撑',resumeBullets:[{text:'访谈活动参与者并整理报名问题',factIds:['improve-f1']}],interviewOutline:[{text:'说明访谈过程与发现的问题',factIds:['improve-f1']}],coverage:[{requirementId:'improve-r1',kind:'direct',factIds:['improve-f1']},{requirementId:'improve-r2',kind:'transferable',factIds:['improve-f1']}] };
async function seed(page:Page) { await page.goto('/'); await expect(page.getByRole('button',{name:'体验6个示例岗位'})).toBeEnabled(); await page.getByText('资料备份',{exact:true}).click(); page.once('dialog',dialog=>dialog.accept()); await page.getByLabel('选择备份文件',{exact:true}).setInputFiles({name:'improve.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({format:'jdtool-backup',version:2,jobs:[job],projects:[project]}))}); await expect(page.getByText('备份已恢复。',{exact:true})).toBeVisible(); await page.getByText('资料备份',{exact:true}).click(); }

test('项目生成后显示百分比与逐项依据，表述可用，刷新和备份保留匹配结果',async({page})=>{
  let empty=true;await page.route('**/api/project-recommendations',route=>{const data={recommendations:[empty?{...recommendation,resumeBullets:[],interviewOutline:[]}:recommendation],gaps:[],needsReview:[]};empty=false;return route.fulfill({json:data});});
  await seed(page); await page.getByRole('button',{name:job.title,exact:true}).click(); await page.getByRole('tab',{name:/准备项目/}).click();
  await expect(page.getByText('选择已核对的项目后，点击“AI推荐项目”，生成简历要点与面试提纲。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'AI推荐项目',exact:true}).click();await expect(page.locator('.builder').getByRole('alert')).toContainText('尚未找到有事实支撑');await expect(page.getByRole('textbox',{name:'简历要点1',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'AI推荐项目',exact:true}).click(); const match=page.getByRole('region',{name:'所选项目与岗位的匹配度'});
  await expect(match).toContainText('75'); await expect(page.getByRole('textbox',{name:'简历要点1',exact:true})).toHaveValue(recommendation.resumeBullets[0].text);
  await match.getByText('查看逐项匹配依据',{exact:true}).click(); await expect(match.getByText('直接相关',{exact:true})).toBeVisible(); await expect(match.getByText('方法可迁移',{exact:true})).toBeVisible();
  await page.reload(); await page.getByRole('tab',{name:/准备项目/}).click(); await expect(match).toContainText('75');
  await page.getByText('资料备份',{exact:true}).click(); const download=page.waitForEvent('download'); await page.getByRole('button',{name:'导出备份',exact:true}).click(); const {readFile}=await import('node:fs/promises'); const exported=JSON.parse(await readFile((await(await download).path())!,'utf8')); expect(exported.recommendations[0].data.recommendations[0].coverage).toEqual(recommendation.coverage);
});

test('首页提问直接打开对话并发送，失败可重试，其他页面保留会话，聊天支持语音填入',async({page})=>{
  let calls=0; const requests:any[]=[];
  await page.route('**/api/chat',async route=>{requests.push(route.request().postDataJSON()); if(++calls===1) return route.fulfill({status:503,json:{error:{message:'暂时未收到回答，请重试。'}}}); return route.fulfill({json:{answer:'匹配度按JD要求与已确认项目事实的覆盖情况计算，方法可迁移按半项计。',suggestions:['怎么补充缺少的依据？']}});});
  await seed(page); await page.getByRole('button',{name:'返回首页',exact:true}).click(); await page.getByRole('textbox',{name:'向准备助手提问',exact:true}).fill('项目匹配度是怎么算的？'); await page.getByRole('button',{name:'问一问',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'准备助手',exact:true}); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('alert')).toContainText('暂时未收到回答'); await dialog.getByRole('button',{name:'重试这条提问',exact:true}).click(); await expect(dialog.locator('.assistant-message.assistant')).toContainText('方法可迁移按半项计');
  expect(requests[0].question).toBe('项目匹配度是怎么算的？'); expect(requests[0].projects).toBeUndefined(); expect(requests[1].history).toEqual([]); await expect(dialog.locator('.assistant-message.user')).toHaveCount(1);
  if(page.viewportSize()!.width>=768){await navigate(page,'我的项目');await expect(dialog).toBeVisible();}else{await dialog.getByRole('button',{name:'关闭准备助手',exact:true}).click();await navigate(page,'我的项目');await page.getByRole('button',{name:'打开准备助手',exact:true}).click();}await expect(dialog.locator('.assistant-message.assistant')).toBeVisible();
  await dialog.getByRole('button',{name:'语音输入：准备助手提问内容',exact:true}).click(); const voice=dialog.getByRole('region',{name:'语音输入',exact:true}); await voice.getByRole('textbox',{name:'识别文字',exact:true}).fill('我应该先补充哪些信息？'); await voice.getByRole('button',{name:'填入文字',exact:true}).click(); await expect(dialog.getByRole('textbox',{name:'准备助手提问内容',exact:true})).toHaveValue('我应该先补充哪些信息？');
  await dialog.getByRole('textbox',{name:'准备助手提问内容',exact:true}).press('Control+Enter'); await expect(dialog.locator('.assistant-message.assistant')).toHaveCount(2); expect(requests.at(-1).history).toHaveLength(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('练习按实际宽度和高度收起会话栏，长任务保留消息空间，助手入口不挡住发送',async({page})=>{
  const exercise={id:'responsive-exercise',direction:'产品经理',background:'围绕用户反馈梳理问题并确定本轮可验证的改动。'.repeat(12),question:'如何判断需求优先级？',dimensions:['需求','协作','验证'],followupDirections:['依据'],nodes:[{title:'梳理LUI体验痛点并确定优化优先级',situation:'收到用户反馈：执行剪辑指令时，部分模糊需求会导致结果偏差，用户也难以判断当前使用的功能。请整理需要核对的问题与处理方向。',colleague:'产品经理',choices:['先核对反馈','先对照使用流程'],change:'说明判断依据和验证办法。'},{title:'设计可落地的验证方案',situation:'请制定验证方法与协作安排。',colleague:'技术同事',choices:['安排走查','核对指标'],change:'说明所需资源。'}]};
  await page.route('**/api/assist',route=>route.fulfill({json:exercise}));await seed(page);await navigate(page,'岗位体验');await expect(page.locator('.conversation-app')).toBeVisible();
  for(const [width,height]of [[1440,900],[1024,640],[1000,500],[820,600],[390,844],[320,740],[844,390]]){
    await page.setViewportSize({width,height});await expect.poll(()=>page.locator('.chat-messages').evaluate(node=>{const box=node.getBoundingClientRect();const composer=document.querySelector('.chat-composer')!.getBoundingClientRect();return box.height>=150&&box.bottom<=composer.top+1&&document.documentElement.scrollWidth<=innerWidth;})).toBe(true);
    if(width<1100||height<700){await expect(page.locator('.office-contacts')).toBeHidden();await page.getByRole('button',{name:'会话',exact:true}).click();await expect(page.locator('.office-contacts')).toBeVisible();await page.getByRole('button',{name:'关闭会话列表',exact:true}).click();}
    await expect(page.locator('.conversation-app-header').getByRole('button',{name:'打开准备助手',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'放大练习窗口',exact:true}).click();await expect(page.locator('.conversation-app')).toHaveClass(/is-expanded/);await expect.poll(()=>page.locator('.chat-composer').evaluate(node=>node.getBoundingClientRect().bottom<=innerHeight)).toBe(true);await page.keyboard.press('Escape');await expect(page.locator('.conversation-app')).not.toHaveClass(/is-expanded/);
  await page.reload();await expect(page.locator('.conversation-app-header').getByRole('button',{name:'打开准备助手',exact:true})).toBeVisible();await expect(page.locator('body > .assistant-launcher')).toHaveCount(0);
});
