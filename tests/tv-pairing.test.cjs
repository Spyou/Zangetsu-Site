const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const cloud='https://eogwzrlfoercfwcfwlmv.supabase.co',vps='https://sb.zangetsu.online';
const tick=()=>new Promise(r=>setImmediate(r));
async function page(name,search,saved){
 const script=fs.readFileSync(path.join(__dirname,'../',name,'index.html'),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const calls=[],elements={},storage=new Map(saved?[['tvpair',JSON.stringify(saved)]]:[]);
 const element=id=>elements[id]??={value:id==='email'?'fixture@example.invalid':id==='password'?'fixture-password':id==='name'?'Fixture':'',addEventListener(){},querySelectorAll:()=>[]};
 const context={URL,URLSearchParams,Uint8Array,TextEncoder,atob,btoa,crypto:webcrypto,navigator:{userAgent:''},location:{search,hash:'',replace(url){calls.push({redirect:url});}},document:{getElementById:element},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({ok:true,access_token:'fixture-token',user:{id:'fixture'},session:{accessToken:'fixture'}})};}};
 vm.createContext(context);vm.runInContext(script,context);await tick();await tick();
 return {context,calls,storage,elements,async submit(mode){await vm.runInContext(`mode=${JSON.stringify(mode)};onSubmit({preventDefault(){}})`,context);await tick();}};
}
for(const [selector,base] of [['',cloud],['&auth=vps',vps]]){
 test('pair uses selected backend for info, login, signup, recover and approve: '+base,async()=>{
  const p=await page('pair','?code=ABCDEFGH'+selector);
  await p.submit('login');await p.submit('signup');await p.submit('forgot');
  assert.equal(p.calls.length,7);for(const c of p.calls){assert.ok(c.url.startsWith(base+'/'));const key=JSON.parse(Buffer.from(c.options.headers.apikey.split('.')[1],'base64url'));assert.equal(key.role,'anon');assert.equal(key.ref,selector?undefined:'eogwzrlfoercfwcfwlmv');}
  for(const endpoint of ['/functions/v1/pair-tv','/auth/v1/token?grant_type=password','/auth/v1/signup','/rest/v1/profiles','/auth/v1/recover']) assert.ok(p.calls.some(c=>c.url===base+endpoint));
  assert.equal(new URLSearchParams(vm.runInContext('pairQuery()',p.context)).get('auth'),selector?'vps':null);
 });
 for(const tracker of ['anilist','mal','simkl'])test('tracker OAuth stores selection and callback keeps backend: '+tracker+' '+base,async()=>{
  const p=await page('tv-connect','?code=ABCDEFGH&nonce='+Buffer.alloc(32).toString('base64url')+'&tracker='+tracker+selector);
  const saved=JSON.parse(p.storage.get('tvpair'));assert.equal(saved.auth,selector?'vps':null);assert.equal(p.calls.filter(c=>c.url).length,0);
  const callback=await page('tv-connect','?code=oauth-code',saved);await new Promise(r=>setTimeout(r,40));
  assert.equal(callback.calls.length,2);for(const c of callback.calls)assert.equal(c.url,base+'/functions/v1/pair-tv');
 });
}
test('old saved tracker session defaults to Cloud',async()=>{const p=await page('tv-connect','?code=oauth-code',{code:'ABCDEFGH',nonce:Buffer.alloc(32).toString('base64url'),tracker:'mal'});await new Promise(r=>setTimeout(r,40));assert.equal(p.calls.length,2);assert.ok(p.calls.every(c=>c.url===cloud+'/functions/v1/pair-tv'));});
test('unknown selectors fail before credential, OAuth or backend calls',async()=>{
 for(const name of ['pair','tv-connect'])for(const selector of ['wrong','','VPS','https://attacker.invalid']){
  const p=await page(name,'?code=ABCDEFGH&nonce=x&tracker=mal&auth='+encodeURIComponent(selector));
  if(name==='pair')await p.submit('login');assert.equal(p.calls.length,0);
 }
 const p=await page('tv-connect','?code=oauth-code',{code:'ABCDEFGH',nonce:'x',tracker:'mal',auth:'wrong'});assert.equal(p.calls.length,0);
});
test('explicit Cloud selector stays on Cloud for login and tracker callback',async()=>{
 const p=await page('pair','?code=ABCDEFGH&auth=cloud');await p.submit('login');assert.equal(p.calls.length,3);assert.ok(p.calls.every(c=>c.url.startsWith(cloud+'/')));
 const start=await page('tv-connect','?code=ABCDEFGH&nonce=x&tracker=mal&auth=cloud');const saved=JSON.parse(start.storage.get('tvpair'));assert.equal(saved.auth,'cloud');
 const callback=await page('tv-connect','?code=oauth-code',saved);assert.equal(callback.calls[0].url,cloud+'/functions/v1/pair-tv');
});
test('duplicate selectors fail before login, OAuth and callback APIs',async()=>{
 for(const selectors of ['auth=vps&auth=vps','auth=cloud&auth=vps','auth=vps&auth=cloud'])for(const name of ['pair','tv-connect']){
  const p=await page(name,'?code=ABCDEFGH&nonce=x&tracker=mal&'+selectors);if(name==='pair')await p.submit('login');assert.equal(p.calls.length,0);
 }
 const p=await page('tv-connect','?code=oauth-code&auth=vps&auth=vps',{auth:'vps',code:'ABCDEFGH',nonce:'x',tracker:'mal'});assert.equal(p.calls.length,0);
});
test('callback query cannot override saved backend selection',async()=>{
 for(const [auth,queryAuth,base] of [['vps','cloud',vps],['cloud','vps',cloud]]){
  const p=await page('tv-connect','?code=oauth-code&auth='+queryAuth,{auth,code:'ABCDEFGH',nonce:Buffer.alloc(32).toString('base64url'),tracker:'mal'});await new Promise(r=>setTimeout(r,40));assert.equal(p.calls.length,2);assert.ok(p.calls.every(c=>c.url===base+'/functions/v1/pair-tv'));
 }
});
