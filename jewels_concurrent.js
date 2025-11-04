/**
 * @module 智能音乐源插件
 * @name 智能音乐源插件 - 合并增强版
 * @description 集成多个音乐平台的资源获取功能，支持获取音乐URL
 * @features 多源API智能选择、自动重试机制、统一错误处理、请求超时控制
 * @version v1.1.0
 * @author ikucao
 * @license MIT
 */

const { lx: g } = globalThis;
const { EVENT_NAMES, request, on, send, env, version } = g;
const isMobile = () => typeof env !== 'undefined' && env === 'mobile';
const DEV = !isMobile();
const TMOUT = 10000;

// 配置常量
const QLTY_MAP = Object.freeze({ '128k': '128', '320k': '320', 'flac': '740' });
const QLTYS = Object.freeze({kw:['128k','320k','flac','flac24bit','hires'],mg:['128k','320k','flac','flac24bit','hires'],kg:['128k','320k','flac','flac24bit','hires','atmos','master'],tx:['128k','320k','flac','flac24bit','hires','atmos','atmos_plus','master'],wy:['128k','320k','flac','flac24bit','hires','atmos','master'],git:['128k','320k','flac']});
const SRC_MAP = Object.freeze({kw:{api:'kuwo',name:'酷我音乐'},kg:{api:'kugou',name:'酷狗音乐'},wy:{api:'netease',name:'网易云音乐'},tx:{api:'tencent',name:'QQ音乐'},mg:{api:'migu',name:'咪咕音乐'}});
const API_SRCS = Object.freeze([
  {id:1,url:'http://103.217.184.26:9000',key:'',name:'ikun公益源',active:true,urlFormat:'query',scriptMd5:'d7ada446a9e88d178efd7e02dc5f9879'},
  {id:2,url:'https://88.lxmusic.xn--fiqs8s',key:'lxmusic',name:'洛雪音乐(备用源)',active:true,urlFormat:'path',scriptMd5:'83b9ef5707ef3d8aadddc07749529594'},
  {id:3,url:'https://m-api.ceseet.me',key:'',name:'fish_music',active:true,urlFormat:'path',scriptMd5:'5fe365644241ca1b6a0f7ae4e333cf52'},
  {id: 4, url: 'https://lxmusicapi.onrender.com', key: 'share-v2', name: 'Huibq_lxmusic源', active: true, urlFormat: 'path', scriptMd5: ''}
]);

// 全局变量
const API_URL = 'https://music-api.gdstudio.xyz/api.php';
let priSrcs = [];
const DEF_ACTIONS = ['musicUrl'];

// 工具函数
const getSongId = (m) => {
  const id = m.hash ?? m.songmid ?? m.id;
  if (!id || (typeof id === 'string' && /^\s*$/.test(id))) throw new Error('无效ID');
  return String(id);
};

// HTTP请求
const HTTP_DEF = {method:'GET',headers:{'Content-Type':'application/json','Accept':'*/*','User-Agent':`${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`},timeout:TMOUT};

const httpReq = async (url, opts = {}) => {
  if (!url || typeof url !== 'string' || !url.trim()) throw new Error('无效URL');
  const mOpts = {...HTTP_DEF, ...opts};
  if (opts.headers) mOpts.headers = {...HTTP_DEF.headers, ...opts.headers};
  delete mOpts.timeout;
  return new Promise((res, rej) => {
    request(url, mOpts, (err, resp) => {
      if (err) return rej(err);
      if (resp.statusCode !== 200 && resp.statusCode !== 0) return rej(new Error(`HTTP ${resp.statusCode}`));
      res(resp);
    });
  });
};

// 构建API URL
const buildUrl = (base, src, id, q, t = 'url', fmt = 'query', cp = {}) => {
  if (!base || !src || id == null || (typeof id === 'string' && /^\s*$/.test(id))) throw new Error('参数错误');
  const sid = String(id);
  if (fmt === 'path') return `${base}/${t}/${src}/${sid}/${q}`;
  const p = new URLSearchParams();
  p.append('source', src);
  p.append('songId', sid);
  p.append('quality', q);
  if (cp) Object.entries(cp).forEach(([k, v]) => v != null && p.append(k, v));
  return `${base}/${t}?${p.toString()}`;
};

// 创建API请求函数
const createReq = (cfg) => async (src, id, q, t) => {
  try {
    const u = buildUrl(cfg.url, src, id, q, t, cfg.urlFormat);
    const nm = cfg.name || '';
    const { body } = await httpReq(u, {method:'GET',headers:{'Content-Type':'application/json','User-Agent':`${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,'X-Request-Key':cfg.key || ''},follow_max:5,parseResponse:false});
    if (!body) throw new Error(`从${nm}获取失败`);
    const code = Number(body.code);
    if (isNaN(code)) throw new Error(`无效响应码`);
    switch (code) {
      case 0: case 200:
        const url = body.url || body.data;
        if (!url) throw new Error(`URL为空`);
        return {success:true,data:url.replace(/\\\//g, '/')};
      case 403: throw new Error(`${nm}-Key失效`);
      case 422: throw new Error(`${nm}-参数错误`);
      case 429: throw new Error(`${nm}-请求过速`);
      case 500: throw new Error(`${nm}-获取失败:${body.message || '未知'}`);
      default: throw new Error(`${nm}-错误:${code}`);
    }
  } catch (e) { return {success:false,error:e}; }
};

// 多源获取URL（并发请求版本）
const fetchUrl = async (src, info, q) => {
  const id = getSongId(info);
  
  if (priSrcs.length > 0) {
    // 并发请求所有优先API源
    const promises = priSrcs.map(api => createReq(api)(src, id, q, 'url'));
    
    // 使用Promise.race来获取第一个成功的结果
    // 创建一个Promise，当任何一个API请求成功时解析
    const firstSuccess = new Promise((resolve, reject) => {
      let resolved = false;
      
      promises.forEach(p => {
        p.then(result => {
          if (result.success && !resolved) {
            resolved = true;
            resolve(result.data);
          }
        }).catch(() => {}); // 忽略单个请求失败
      });
      
      // 当所有请求都完成但没有成功时
      Promise.all(promises).then(results => {
        if (!resolved) {
          // 检查是否有任何成功的结果
          const successResult = results.find(r => r.success);
          if (successResult) {
            resolve(successResult.data);
          } else {
            // 所有优先源都失败，继续使用备用API
            fallbackApi();
          }
        }
      }).catch(fallbackApi);
      
      function fallbackApi() {
        // 备用API调用
        const apiName = SRC_MAP[src]?.api || src;
        const u = `${API_URL}?types=url&source=${apiName}&id=${id}&br=${QLTY_MAP[q] || q}`;
        httpReq(u)
          .then(({ body }) => {
            const url = body?.url || body?.data?.url || body?.data;
            if (!url) throw new Error('未找到URL');
            resolve(url);
          })
          .catch(reject);
      }
    });
    
    return firstSuccess;
  } else {
    // 没有优先源时，使用备用API
    const apiName = SRC_MAP[src]?.api || src;
    const u = `${API_URL}?types=url&source=${apiName}&id=${id}&br=${QLTY_MAP[q] || q}`;
    const { body } = await httpReq(u);
    const url = body?.url || body?.data?.url || body?.data;
    if (!url) throw new Error('未找到URL');
    return url;
  }
};

// 获取资源
const fetchRes = async (src, info, q, t) => {
  if (!src || typeof src !== 'string' || !info || typeof info !== 'object' || !t || typeof t !== 'string') throw new Error('参数无效');
  const { name = '未知歌曲' } = info;
  try {
    if (t === 'url' && src in QLTYS) return await fetchUrl(src, info, q);
    throw new Error(`不支持获取${t}类型`);
  } catch (e) {
    e.source = src;
    if (DEV) throw new Error(`获取${name}的${t}失败:${e.message}`);
    throw new Error(`获取${name}的${t}失败`);
  }
};

// 验证参数
const validate = (src, act, info) => {
  if (!src || typeof src !== 'string' || !act || typeof act !== 'string' || !info || typeof info !== 'object') throw new Error('参数无效');
  if (act !== 'musicUrl') throw new Error(`不支持${act}`);
  if (!info.musicInfo || typeof info.musicInfo !== 'object' || (info.type && typeof info.type !== 'string')) throw new Error('音乐信息无效');
  return 'url';
};

// 初始化
const sources = {};
for (const s of Object.keys(SRC_MAP)) {
  const i = SRC_MAP[s];
  sources[s] = {name:i.name,type:'music',actions:DEF_ACTIONS,qualitys:QLTYS[s] || Object.keys(QLTY_MAP)};
}
sources.local = {name:'本地音乐',type:'music',actions:DEF_ACTIONS,qualitys:[]};

const initParams = {openDevTools:env !== 'mobile' && DEV,sources};

// 检查API连接
const checkApi = async () => {
  const active = API_SRCS.filter(s => s.active && s.url && s.scriptMd5);
  if (!active.length) return;
  const fast = [];
  await Promise.all(active.map(async s => {
    try {
      const st = Date.now();
      const u = `${s.url}/script?key=${s.key || ''}&checkUpdate=${s.scriptMd5}`;
      const { body } = await httpReq(u, {method:'GET',headers:{'Content-Type':'application/json','User-Agent':`${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`},timeout:5000,parseResponse:false});
      if (body && (body.code === 0 || body.code === 200)) fast.push({...s,responseTime:Date.now() - st});
    } catch (e) {}
  }));
  if (fast.length) {
    fast.sort((a,b) => a.responseTime - b.responseTime);
    priSrcs = fast.slice(0,2);
  }
};

// 初始化处理
const init = async () => {
  send(EVENT_NAMES.inited, initParams);
  await checkApi().catch(() => {});
};

// 事件监听
on(EVENT_NAMES.request, async (e) => {
  const { source, action, info } = e;
  const t = validate(source, action, info);
  return await fetchRes(source, info.musicInfo, info.type, t);
});

// 启动

init().catch(() => {});
