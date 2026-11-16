const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const cloud = 'https://eogwzrlfoercfwcfwlmv.supabase.co';
const vps = 'https://sb.zangetsu.online';
const jwt = issuer => 'e30.' + Buffer.from(JSON.stringify({iss:issuer})).toString('base64url') + '.signature';
const hash = issuer => '#'+new URLSearchParams({access_token:jwt(issuer),refresh_token:'fixture-refresh',type:'recovery'});
const tick = () => new Promise(resolve => setImmediate(resolve));
async function page({fragment='',search='',sessionError=false,verifyDelay,updateError=false}={}) {
  const calls=[]; const elements={};
  for(const id of ['landing','reset','form','btn','msg','pw','pw2']) elements[id]={style:{},disabled:false,value:'test-password',querySelectorAll:()=>[],addEventListener(event,callback){this[event]=callback;}};
  const session={access_token:'verified-token',user:{id:'fixture-user'}};
  const client={auth:{
    async setSession(tokens){calls.push(['setSession',tokens]);if(verifyDelay)await verifyDelay;return {data:{session},error:sessionError?new Error('Invalid session'):null};},
    async verifyOtp(tokens){calls.push(['verifyOtp',tokens]);if(verifyDelay)await verifyDelay;return {data:{session},error:sessionError?new Error('Invalid link'):null};},
    async getUser(){calls.push(['getUser']);return {data:{user:{id:'fixture-user'}},error:sessionError?new Error('Invalid user'):null};},
    async updateUser(value){calls.push(['updateUser',value]);return {data:{user:{id:'fixture-user'}},error:updateError?new Error('Reset rejected'):null};}
  },from(){return {update(){return {eq(){return Promise.resolve({})}}}}}};
  const context={URLSearchParams,atob,console,location:{search,hash:fragment},supabase:{createClient(url,key,options){calls.push(['client',url,key,options]);return client;}},document:{getElementById:id=>elements[id],querySelector:()=>null,querySelectorAll:()=>[],head:{appendChild(){throw Error('Unexpected external SDK load')}}},fetch:()=>Promise.reject(Error('No release fetch in test'))};
  context.window=context;vm.runInNewContext(script,context);await tick();await tick();
  return {calls,elements,async submit(){elements.form.submit({preventDefault(){}});await tick();await tick();}};
}
test('VPS recovery uses its issuer, never the live Cloud default', async()=>{
 const p=await page({fragment:hash(vps+'/auth/v1')});assert.equal(p.calls.find(c=>c[0]==='client')[1],vps);assert.equal(p.elements.btn.disabled,false);await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,1);
});
test('Cloud recovery stays on Cloud even when query requests VPS',async()=>{
 const p=await page({fragment:hash(cloud+'/auth/v1'),search:'?auth=vps'});assert.equal(p.calls.find(c=>c[0]==='client')[1],cloud);assert.equal(p.elements.btn.disabled,false);
});
test('old token-hash links keep Cloud; explicit VPS token-hash links use VPS',async()=>{
 for(const [search,url] of [['?token_hash=fixture&type=recovery',cloud],['?token_hash=fixture&type=recovery&auth=vps',vps]]){
  const p=await page({search});assert.equal(p.calls.find(c=>c[0]==='client')[1],url);assert.equal(p.calls.filter(c=>c[0]==='verifyOtp').length,1);assert.equal(p.elements.btn.disabled,false);
 }
});
test('foreign, malformed and incomplete access-token links never contact Auth',async()=>{
 for(const fragment of [hash('https://attacker.invalid/auth/v1'),hash(vps+'/auth/v1/extra'),'#access_token=broken&refresh_token=x&type=recovery','#access_token='+jwt(vps+'/auth/v1')+'&type=recovery']){
  const p=await page({fragment});assert.equal(p.calls.length,0);assert.equal(p.elements.btn.disabled,true);assert.match(p.elements.msg.textContent,/link/i);
 }
});
test('unknown token-hash selector and conflicting link formats fail closed',async()=>{
 for(const x of [{search:'?token_hash=x&type=recovery&auth=https://attacker.invalid'},{search:'?token_hash=x&type=recovery',fragment:hash(vps+'/auth/v1')}]){const p=await page(x);assert.equal(p.calls.length,0);assert.equal(p.elements.btn.disabled,true);}
});
test('submit waits for session verification and cannot run while disabled',async()=>{
 let done;const pending=new Promise(resolve=>{done=resolve});const p=await page({fragment:hash(vps+'/auth/v1'),verifyDelay:pending});assert.equal(p.elements.btn.disabled,true);await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,0);done();await tick();await tick();assert.equal(p.elements.btn.disabled,false);
});
test('invalid sessions keep reset disabled and never submit a new password',async()=>{
 const p=await page({fragment:hash(vps+'/auth/v1'),sessionError:true});assert.equal(p.elements.btn.disabled,true);await p.submit();assert.equal(p.calls.filter(c=>c[0]==='updateUser').length,0);
});
test('landing visitors do not initialize Auth',async()=>{const p=await page();assert.equal(p.calls.length,0);});
test('a rejected password update can be retried',async()=>{const p=await page({fragment:hash(vps+'/auth/v1'),updateError:true});await p.submit();assert.equal(p.elements.btn.disabled,false);assert.match(p.elements.msg.textContent,/rejected/i);});

test('VPS ships only a public anon key and keeps reset sessions isolated',async()=>{
 const p=await page({fragment:hash(vps+'/auth/v1')});const client=p.calls.find(c=>c[0]==='client');
 const payload=JSON.parse(Buffer.from(client[2].split('.')[1],'base64url').toString());assert.equal(payload.role,'anon');
 assert.equal(client[3].auth.persistSession,false);assert.equal(client[3].auth.detectSessionInUrl,false);assert.equal(client[3].auth.autoRefreshToken,false);
});
