/**
 * @module 智能音乐源插件
 * @name 智能音乐源插件 - 合并增强版
 * @description 集成多个音乐平台的资源获取功能，支持获取音乐URL
 * @features 多源API智能选择、自动重试机制、统一错误处理、请求超时控制
 * @version v1.1.0
 * @author ikucao
 * @license MIT
 */

// 全局配置
const { lx: lxGlobal } = globalThis;
const { EVENT_NAMES, request, on, send, env, version } = lxGlobal;
const isMobilePlatform = () => typeof env !== 'undefined' && env === 'mobile';

// 支持通过URL路径中文件名后的空格和参数传递DEV_ENABLE设置
// 使用方法：
// 浏览器环境: 通过URL路径中文件名后加空格和参数 (例如: jewels_optimized.js%201 或 jewels_optimized.js%20true)
// 未指定参数时: 保持默认行为（非移动平台启用开发模式）
let DEV_ENABLE = !isMobilePlatform(); // 默认值

// 尝试从URL路径中解析文件名后的参数
try {
  // 浏览器环境 - 检查URL路径
  if (typeof window !== 'undefined' && window.location && window.location.pathname) {
    const pathname = window.location.pathname;
    // 解析文件名后面的空格和参数部分
    const match = pathname.match(/jewels_optimized\.js\s+([^/]+)/i);
    if (match && match[1]) {
      const param = match[1].toLowerCase();
      // 支持多种参数格式：1、true、dev、开发 等表示启用开发模式
      if (param === '1' || param === 'true' || param === 'dev' || param === '%e5%bc%80%e5%8f%91') {
        DEV_ENABLE = true;
      } else if (param === '0' || param === 'false') {
        DEV_ENABLE = false;
      }
    }
    
    // 兼容之前的URL查询参数方式
    const urlParams = new URLSearchParams(window.location.search);
    const devParam = urlParams.get('dev');
    if (devParam !== null) {
      DEV_ENABLE = devParam.toLowerCase() === 'true';
    }
  }
} catch (e) {
  // 解析失败时保持默认值
}

const DEFAULT_TIMEOUT = 10000;

// 日志函数
const log = (...args) => DEV_ENABLE && typeof console !== 'undefined' && console.log && console.log('[Jewels]', ...args);
const errorLog = (...args) => DEV_ENABLE && typeof console !== 'undefined' && console.error && console.error('[Jewels]', ...args);

// 常量定义
const STANDARD_QUALITY_MAP = Object.freeze({ '128k': '128', '320k': '320', 'flac': '740' });
const MUSIC_QUALITY = Object.freeze({
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  mg: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  git: ['128k', '320k', 'flac']
});
const SOURCE_MAP = Object.freeze({
  kw: { api: 'kuwo', name: '酷我音乐' },
  kg: { api: 'kugou', name: '酷狗音乐' },
  wy: { api: 'netease', name: '网易云音乐' },
  tx: { api: 'tencent', name: 'QQ音乐' },
  mg: { api: 'migu', name: '咪咕音乐' },
});
const API_SOURCES = Object.freeze([
  {id: 1, url: 'http://160.202.237.98:9000', key: '', name: 'ikun公益源', active: true, urlFormat: 'query'},
  {id: 2, url: 'https://88.lxmusic.xn--fiqs8s', key: 'lxmusic', name: '洛雪音乐(备用源)', active: true, urlFormat: 'path'},
  {id: 3, url: 'https://m-api.ceseet.me', key: '', name: 'fish_music', active: true, urlFormat: 'path'},
  {id: 4, url: 'https://lxmusicapi.onrender.com', key: 'share-v2', name: 'Huibq_lxmusic源', active: true, urlFormat: 'path'}
]);

// 全局变量
const API_BASE_URL = 'https://music-api.gdstudio.xyz/api.php';
let prioritizedApiSources = [];
const DEFAULT_ACTIONS = ['musicUrl'];
const requestCache = new Map();
const CACHE_EXPIRY = 30000;
const apiHealth = {};

// 工具函数
const utils = {
  getSongId(musicInfo) {
    const songId = musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id;
    if (!songId || (typeof songId === 'string' && /^\s*$/.test(songId))) {
      throw new Error('无效的音乐信息: 缺少有效ID');
    }
    return String(songId);
  }
};

// 缓存函数
const getCacheKey = (url, options = {}) => options.method === 'POST' ? null : `GET:${url}`;
const checkCache = (cacheKey) => cacheKey && requestCache.get(cacheKey)?.timestamp > Date.now() - CACHE_EXPIRY ? (log('缓存命中:', cacheKey), requestCache.get(cacheKey).data) : null;
const updateCache = (cacheKey, data) => {
  if (!cacheKey) return;
  requestCache.set(cacheKey, { data, timestamp: Date.now() });
  if (requestCache.size > 100) requestCache.delete(requestCache.keys().next().value);
};

// HTTP请求
const HTTP_DEFAULT_OPTIONS = {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
        'User-Agent': `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`
  },
  timeout: DEFAULT_TIMEOUT
};

const httpRequest = async (url, options = {}) => {
  if (!url || typeof url !== 'string' || !url.trim()) throw new Error('无效的URL参数');
  
  const cacheKey = getCacheKey(url, options);
  const cachedData = checkCache(cacheKey);
  if (cachedData) return cachedData;
  
  const mergedOptions = {...HTTP_DEFAULT_OPTIONS, ...options};
  if (options.headers) mergedOptions.headers = {...HTTP_DEFAULT_OPTIONS.headers, ...options.headers};
  
  return new Promise((resolve, reject) => {
    request(url, mergedOptions, (error, resp) => {
      if (error) {
        errorLog('请求错误:', url, error);
        return reject(error);
      }
      
      if (resp.statusCode !== 200 && resp.statusCode !== 0) {
        const statusError = new Error(`HTTP ${resp.statusCode}`);
        errorLog('状态码错误:', url, resp.statusCode);
        return reject(statusError);
      }
      
      if (cacheKey) updateCache(cacheKey, resp);
      resolve(resp);
    });
  });
};

// URL构建
function buildApiUrl(baseUrl, source, songId, quality, types = 'url', urlFormat = 'query', customParams = {}) {
  // 参数验证
  if (!baseUrl || typeof baseUrl !== 'string') throw new Error('无效的基础URL参数');
  if (!source || typeof source !== 'string') throw new Error('无效的音源参数');
  if (songId == null || (typeof songId === 'string' && /^\s*$/.test(songId))) {
    throw new Error('无效的音乐ID: ID不能为空');
  }
  
  const processedSongId = String(songId);
  
  if (!types || typeof types !== 'string' || types !== 'url') {
    throw new Error('无效的types参数，仅支持url');
  }
  if (!urlFormat || typeof urlFormat !== 'string' || !['query', 'path'].includes(urlFormat)) {
    throw new Error('无效的urlFormat参数，支持的值: query, path');
  }
  
  // 构建URL
  if (urlFormat === 'path') {
    return `${baseUrl}/${types}/${source}/${processedSongId}/${quality}`;
  } else {
    const params = new URLSearchParams();
    params.append('source', source);
    params.append('songId', processedSongId);
    params.append('quality', quality);
    if (customParams) Object.entries(customParams).forEach(([k, v]) => v != null && params.append(k, v));
    return `${baseUrl}/${types}?${params.toString()}`;
  }
}

// ===== 8. API健康监控 =====
// 更新API健康状态
function updateApiHealth(apiId, isSuccess, responseTime = 0) {
  const health = apiHealth[apiId] || (apiHealth[apiId] = {
    successCount: 0, failureCount: 0, totalResponseTime: 0,
    requestCount: 0, lastSuccess: 0, avgResponseTime: 0
  });
  
  health.requestCount++;
  if (isSuccess) {
    health.successCount++;
    health.totalResponseTime += responseTime;
    health.lastSuccess = Date.now();
    health.avgResponseTime = health.totalResponseTime / health.successCount;
  } else health.failureCount++;
  
  if (health.requestCount > 100) {
    health.successCount = Math.floor(health.successCount * 0.7);
    health.failureCount = Math.floor(health.failureCount * 0.7);
    health.totalResponseTime = Math.floor(health.totalResponseTime * 0.7);
    health.requestCount = Math.floor(health.requestCount * 0.7);
    health.avgResponseTime = health.successCount > 0 ? health.totalResponseTime / health.successCount : 0;
  }
}

// 获取API健康分数
function getApiHealthScore(apiId) {
  const health = apiHealth[apiId];
  if (!health || health.requestCount === 0) return 50;
  
  const successRate = health.successCount / health.requestCount;
  const avgResponseTime = health.avgResponseTime || (health.successCount > 0 ? health.totalResponseTime / health.successCount : 10000);
  const responseTimeScore = Math.max(0, 100 - (avgResponseTime / 100));
  
  return Math.round((successRate * 100 * 0.7) + (responseTimeScore * 0.3));
}

// ===== 9. API请求处理 =====
// 创建API请求（单次请求）
function createApiRequest(sourceConfig) {
  return async (source, songId, quality, types) => {
    const apiName = sourceConfig.name || 'Unknown API';
    
    try {
      log(`API请求: ${apiName}`, {
        source,
        songId,
        quality
      });
      
      const targetUrl = buildApiUrl(sourceConfig.url, source, songId, quality, types, sourceConfig.urlFormat);
      
      // 创建统一的请求配置
      const requestConfig = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,
          "X-Request-Key": sourceConfig.key || ''
        },
        follow_max: 5,
        parseResponse: false
      };
      
      // 记录请求开始时间用于性能监控
      const startTime = Date.now();
      const { body } = await httpRequest(targetUrl, requestConfig);
      const responseTime = Date.now() - startTime;
      
      log(`${apiName} 响应时间: ${responseTime}ms`);
      
      // 统一的错误处理逻辑
      if (!body) {
        throw new Error(`从${apiName}获取失败: 响应为空`);
      }
      
      const responseCode = Number(body.code);
      if (isNaN(responseCode)) {
        throw new Error(`从${apiName}获取失败: 无效的响应码格式`);
      }
      
      switch (responseCode) {
        case 0:
        case 200:
          // 更新API健康状态
          updateApiHealth(sourceConfig.id, true, responseTime);
          
          // 处理URL，将转义斜杠转换为正常斜杠
          const urlValue = body.url || body.data;
          const musicUrl = urlValue ? urlValue.replace(/\\\//g, '/') : null;
          
          if (!musicUrl) {
            throw new Error(`从${apiName}获取成功但URL为空`);
          }
          
          log(`${apiName} 请求成功: 获取音乐URL`);
          return { success: true, data: musicUrl };
        
        case 403: 
          throw new Error(`${apiName} - Key失效/鉴权失败`);
        case 422: 
          throw new Error(`${apiName} - 无法处理的实体，请求参数可能不正确`);
        case 429: 
          throw new Error(`${apiName} - 请求过速`);
        case 500: 
          throw new Error(`${apiName} - 获取URL失败, ${body.message ?? "未知错误"}`);
        default: 
          throw new Error(`${apiName} - 错误码: ${responseCode}, ${body.message ?? "未知错误"}`);
      }
    } catch (error) {
      errorLog(`${apiName} 请求失败:`, error.message);
      
      // 更新API健康状态
      updateApiHealth(sourceConfig.id, false);
      
      return { success: false, error };
    }
  };
}

// 多源API获取音乐URL
async function fetchFromMultiSourceApis(source, musicInfo, quality) {
  const { name = '未知歌曲' } = musicInfo;
  const songId = utils.getSongId(musicInfo);
  let lastError;
  const startTime = Date.now();
  
  log(`开始获取音乐URL: ${name}`, { source, songId, quality });
  
  // 无优先源时重新握手
  if (prioritizedApiSources.length === 0) {
    log('无可用优先API源，重新握手');
    await checkApiConnection().catch(e => errorLog('API握手失败:', e));
  }
  
  // 尝试优质API源
  for (const apiSource of prioritizedApiSources) {
    const requestResult = await createApiRequest(apiSource)(source, songId, quality, 'url');
    
    if (requestResult.success) {
      log(`成功从 ${apiSource.name} 获取音乐URL，耗时 ${Date.now() - startTime}ms`);
      return requestResult.data;
    } else {
      lastError = requestResult.error;
      
      // 关键错误处理
      if (['403', 'Key失效', '鉴权失败'].some(keyword => 
          requestResult.error.message.includes(keyword))) {
        updateApiHealth(apiSource.id, false);
      }
    }
  }
  
  // 尝试备用源
  log('所有优先源失败，尝试备用源');
  try {
    const apiSourceName = SOURCE_MAP[source]?.api || source;
    const targetUrl = `${API_BASE_URL}?types=url&source=${apiSourceName}&id=${songId}&br=${STANDARD_QUALITY_MAP[quality] || quality}`;
    const { body } = await httpRequest(targetUrl);
    
    const url = extractMusicUrl(body);
    if (!url) throw new Error('从备用源获取失败: 无法提取有效的URL');
    
    log(`成功从备用源获取音乐URL，耗时 ${Date.now() - startTime}ms`);
    return url;
  } catch (error) {
    throw lastError || error;
  }
}

// ===== 10. 音乐URL提取工具 =====
// 从响应体中提取音乐URL
function extractMusicUrl(body) {
  if (!body) return null;
  
  // 尝试多种可能的URL提取方式
  if (typeof body === 'string') {
    try {
      const parsedBody = JSON.parse(body);
      return parsedBody.url || parsedBody.data?.url || parsedBody.data;
    } catch (e) {
      // 如果不是有效的JSON字符串，返回原始内容
      return body;
    }
  }
  
  // 对于对象类型的响应体
  return body.url || body.data?.url || body.data;
}

// ===== 11. 业务逻辑 =====
// 音乐资源获取主函数
const fetchMusicResource = async (source, musicInfo, quality, types) => {
  // 参数验证
  if (!source || typeof source !== 'string' || !musicInfo || typeof musicInfo !== 'object' || !types || typeof types !== 'string') {
    throw new Error('无效的请求参数');
  }
  
  const { name = '未知歌曲' } = musicInfo;
  
  try {
    // 处理音乐URL请求
    if (types === 'url' && source in MUSIC_QUALITY) {
      return await fetchFromMultiSourceApis(source, musicInfo, quality);
    }
    
    throw new Error(`不支持从${source}获取${types}类型的资源`);
  } catch (error) {
    error.source = source;
    const errorMessage = `获取${name}的${types}失败`;
    
    // 开发模式提供详细错误
    throw DEV_ENABLE ? 
      new Error(`${errorMessage}: ${error.message} (source: ${source}, quality: ${quality})`) :
      new Error(errorMessage);
  }
};

// 验证请求参数
function validateRequestParams(source, action, info) {
  if (!source || typeof source !== 'string' || !action || typeof action !== 'string' || !info || typeof info !== 'object') {
    throw new Error('无效的请求参数');
  }
  
  // 获取资源类型
  if (action !== 'musicUrl') {
    throw new Error(`不支持的动作类型: ${action}`);
  }
  
  if (!info.musicInfo || typeof info.musicInfo !== 'object' || (info.type && typeof info.type !== 'string')) {
    throw new Error('无效的音乐信息或音质参数');
  }
  
  return 'url'; // 只支持URL类型
}

// ===== 12. 初始化与事件处理 =====
// 初始化音源配置
const sources = {};
for (const source of Object.keys(SOURCE_MAP)) {
  const sourceInfo = SOURCE_MAP[source];
  sources[source] = {
    name: sourceInfo.name,
    type: 'music',
    actions: DEFAULT_ACTIONS,
    qualitys: MUSIC_QUALITY[source] || Object.keys(STANDARD_QUALITY_MAP)
  };
}

// 添加本地音乐支持
sources.local = { name: '本地音乐', type: 'music', actions: DEFAULT_ACTIONS, qualitys: [] };

// 初始化参数
const initParams = {
  openDevTools: env !== 'mobile' && DEV_ENABLE,
  sources: sources
};

// API连接检查
async function checkApiConnection() {
  const activeSources = API_SOURCES.filter(src => src.active && src.url);
  if (activeSources.length === 0) {
    log('没有可用的API源');
    return;
  }
  
  const sourcesWithResponseTime = [];
  
  // 并行检查所有API源
  await Promise.all(activeSources.map(async sourceConfig => {
    try {
      const startTime = Date.now();
      const checkUrl = `${sourceConfig.url}`;
      
      await httpRequest(checkUrl, {
        method: "GET",
        headers: { "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}` },
        timeout: 3000,
        parseResponse: false
      });
      
      const responseTime = Date.now() - startTime;
      updateApiHealth(sourceConfig.id, true, responseTime);
      
      sourcesWithResponseTime.push({
        ...sourceConfig,
        responseTime,
        healthScore: getApiHealthScore(sourceConfig.id)
      });
      
      log(`API源连接成功: ${sourceConfig.name} (${responseTime}ms)`);
    } catch (error) {
      updateApiHealth(sourceConfig.id, false);
      errorLog(`API源连接失败: ${sourceConfig.name}`, error.message);
    }
  }));
  
  // 排序并更新优先源
  if (sourcesWithResponseTime.length > 0) {
    sourcesWithResponseTime.sort((a, b) => {
      if (b.healthScore !== a.healthScore) return b.healthScore - a.healthScore;
      return a.responseTime - b.responseTime;
    });
    
    prioritizedApiSources = sourcesWithResponseTime.slice(0, 2);
    log('优先API源已更新:', prioritizedApiSources.map(src => `${src.name} (score: ${src.healthScore})`));
  } else {
    log('未找到可用的API源，将使用备用源');
  }
}

// 更新API健康状态
function updateApiHealth(apiId, isSuccess, responseTime = 0) {
  if (!apiHealth[apiId]) {
    apiHealth[apiId] = {
      successCount: 0,
      failureCount: 0,
      totalResponseTime: 0,
      requestCount: 0,
      lastSuccess: 0,
      avgResponseTime: 0 // 缓存平均响应时间，减少计算开销
    };
  }
  
  const health = apiHealth[apiId];
  health.requestCount++;
  
  if (isSuccess) {
    health.successCount++;
    health.totalResponseTime += responseTime;
    health.lastSuccess = Date.now();
    // 实时更新平均响应时间
    health.avgResponseTime = health.totalResponseTime / health.successCount;
  } else {
    health.failureCount++;
  }
  
  // 限制历史记录数量，防止内存占用过大
  if (health.requestCount > 100) {
    // 在无重试场景下使用更高效的数据压缩方式
    health.successCount = Math.floor(health.successCount * 0.7);
    health.failureCount = Math.floor(health.failureCount * 0.7);
    health.totalResponseTime = Math.floor(health.totalResponseTime * 0.7);
    health.requestCount = Math.floor(health.requestCount * 0.7);
    // 重新计算平均响应时间
    health.avgResponseTime = health.successCount > 0 ? health.totalResponseTime / health.successCount : 0;
  }
}

// 获取API健康分数
function getApiHealthScore(apiId) {
  if (!apiHealth[apiId] || apiHealth[apiId].requestCount === 0) {
    return 50; // 默认为中等分数
  }
  
  const health = apiHealth[apiId];
  const successRate = health.successCount / health.requestCount;
  // 直接使用缓存的平均响应时间，避免重复计算
  const avgResponseTime = health.avgResponseTime || (health.successCount > 0 ? health.totalResponseTime / health.successCount : 10000);
  
  // 成功率权重70%，响应时间权重30%
  // 响应时间转换为0-100的分数，越短分数越高
  const responseTimeScore = Math.max(0, 100 - (avgResponseTime / 100));
  
  // 计算最终健康分数
  return Math.round((successRate * 100 * 0.7) + (responseTimeScore * 0.3));
}

// 备用API检查
async function checkBackupApiConnection() {
  const startTime = Date.now();
  try {
    await httpRequest(API_BASE_URL, {
      method: "GET",
      headers: { "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}` },
      timeout: 5000,
      parseResponse: false
    });
    const responseTime = Date.now() - startTime;
    updateApiHealth('backup_api_base', true, responseTime);
    log(`备用API连接成功: ${API_BASE_URL} (${responseTime}ms)`);
    return true;
  } catch (error) {
    updateApiHealth('backup_api_base', false);
    errorLog(`备用API连接失败: ${API_BASE_URL}`, error.message);
    return false;
  }
}

// 初始化处理
async function handleInit() {
  try {
    // 发送初始化完成事件
    send(EVENT_NAMES.inited, initParams);
    
    // 并行执行API检查
    await Promise.all([checkApiConnection(), checkBackupApiConnection()]);
    
    // 定时刷新API源健康状态 (每5分钟)
    setInterval(() => {
      checkApiConnection().catch(e => errorLog('定时API握手失败:', e));
    }, 5 * 60 * 1000);
    
    log('初始化完成');
  } catch (error) {
    errorLog('初始化过程中出现错误:', error);
  }
}

// 监听请求事件
on(EVENT_NAMES.request, async (event) => {
  try {
    const { source, action, info } = event;
    const requestId = Math.random().toString(36).substr(2, 9);
    log(`收到请求 #${requestId}:`, { source, action });
    
    const startTime = Date.now();
    const resourceType = validateRequestParams(source, action, info);
    const result = await fetchMusicResource(source, info.musicInfo, info.type, resourceType);
    
    log(`请求 #${requestId} 完成，耗时 ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    errorLog('请求处理失败:', error);
    throw error;
  }
});

// ===== 13. 启动初始化 =====
handleInit().catch(() => {});