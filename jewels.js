/**
 * @module 智能音乐源插件
 * @name 智能音乐源插件 - 合并增强版
 * @description 集成多个音乐平台的资源获取功能，支持获取音乐URL
 * @features 多源API智能选择、统一错误处理、请求超时控制
 * @version v1.1.0
 * @author ikucao
 * @license MIT
 */

// 全局对象引用
const { lx: lxGlobal } = globalThis;
const { EVENT_NAMES, request, on, send, env, version } = lxGlobal;

// 初始化状态标志
let isInitialized = false;

// 基础配置常量
const DEV_ENABLE = true;
const DEFAULT_TIMEOUT = 10000;
const API_BASE_URL = 'https://music-api.gdstudio.xyz/api.php';

// 资源类型映射
const RESOURCE_TYPES = { url: '音乐URL' };

// GD音乐台标准音质映射表
const STANDARD_QUALITY_MAP = Object.freeze({
  '128k': '128',
  '320k': '320',
  'flac': '740',
  'flac24bit': '999'
});

// 其他API各音乐平台支持的音质配置
const MUSIC_QUALITY = Object.freeze({
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  mg: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  git: ['128k', '320k', 'flac']
});

// GD音乐台音源映射表
const SOURCE_MAP = Object.freeze({
  kw: { api: 'kuwo', name: '酷我音乐' },
  kg: { api: 'kugou', name: '酷狗音乐' },
  wy: { api: 'netease', name: '网易云音乐' },
  tx: { api: 'tencent', name: 'QQ音乐' },
  mg: { api: 'migu', name: '咪咕音乐' },
  git: { api: 'git', name: 'Git音乐' }
});

// API源配置表
const API_SOURCES = Object.freeze([
  {id: 1, url: 'http://103.217.184.26:9000', key: '', name: 'ikun公益源', active: true, urlFormat: 'query', scriptMd5: 'd7ada446a9e88d178efd7e02dc5f9879'},
  {id: 2, url: 'https://88.lxmusic.xn--fiqs8s', key: 'lxmusic', name: '洛雪音乐(备用源)', active: true, urlFormat: 'path', scriptMd5: '83b9ef5707ef3d8aadddc07749529594'},
  {id: 3, url: 'https://m-api.ceseet.me', key: '', name: 'fish_music', active: true, urlFormat: 'path', scriptMd5: '5fe365644241ca1b6a0f7ae4e333cf52'},
  {id: 4, url: 'https://lxmusicapi.onrender.com', key: 'share-v2', name: '音乐服务API', active: true, urlFormat: 'path', scriptMd5: ''},
]);

// 全局状态变量
let prioritizedApiSources = [];

// 日志工具
  const logger = {
    debug: DEV_ENABLE ? console.log : () => {},
    info: DEV_ENABLE ? console.log : () => {},
    warning: console.warn,
    error: console.error,
    exception: (error, message = '') => {
      console.error(message, error.stack || error);
    },
    // 日志分组功能
    startGroup: (label) => {
      if (DEV_ENABLE && console.group) {
        console.group(label);
      }
    },
    endGroup: () => {
      if (DEV_ENABLE && console.groupEnd) {
        console.groupEnd();
      }
    }
  };

// 工具函数集合
const utils = {
  // 解析歌曲ID
  getSongId(musicInfo) {
    const songId = musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id;
    if (!songId || (typeof songId === 'string' && /^\s*$/.test(songId))) {
      throw new Error('无效的音乐信息: 缺少有效ID');
    }
    return typeof songId !== 'string' ? String(songId) : songId;
  },

  // 解析API响应数据
  parseResponse(data, types) {
    if (!data || typeof data !== 'object') return null;
    return data.url ?? 
           (typeof data.data === 'string' ? data.data : null) ?? 
           data.data?.url ?? 
           null;
  },

  // 构建查询字符串
  buildQueryString(params) {
    return Object.entries(params)
      .filter(([key, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');
  }
};

// 默认请求选项
const HTTP_DEFAULT_OPTIONS = {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Accept': '*/*',
    'User-Agent': `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`
  },
  timeout: DEFAULT_TIMEOUT
};

// 合并请求选项
function mergeOptions(options = {}) {
  const mergedOptions = {...HTTP_DEFAULT_OPTIONS, ...options};
  if (options.headers) {
    mergedOptions.headers = {...HTTP_DEFAULT_OPTIONS.headers, ...options.headers};
  }
  return mergedOptions;
}

// HTTP请求函数（含超时处理）
async function httpRequest(url, options = {}) {
  
  const startTime = Date.now();
  try {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('无效的URL参数');
    }
    
    const requestOptions = mergeOptions(options);
    const timeoutMs = requestOptions.timeout || DEFAULT_TIMEOUT;
    
    logger.debug(`正在向${url}发送请求`);
  
    // 请求超时处理
    const response = await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`请求超时: ${timeoutMs}ms`));
      }, timeoutMs);
      
      const signal = options?.signal;
      if (signal?.aborted) {
        clearTimeout(timeoutId);
        return reject(new Error('请求已取消'));
      }
      
      let onAbort, isAborted = false;
      
      if (signal) {
        onAbort = () => {
          clearTimeout(timeoutId);
          isAborted = true;
          reject(new Error('请求已取消'));
        };
        signal.addEventListener('abort', onAbort);
      }
      
      request(url, requestOptions, (error, resp) => {
        if (isAborted) return;
        
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onAbort);
        
        if (error || (resp.statusCode !== 200 && resp.statusCode !== 0)) {
          return reject(error || new Error(`HTTP ${resp.statusCode}`));
        }
        resolve(resp);
      });
    });
    
    const duration = Date.now() - startTime;
    logger.debug(`请求完成: (${duration}ms)`);
    
    return response;
  } catch (error) {
    logger.debug(`请求失败: ${url} - ${error.message}`);
    throw error;
  }
}

// 构建API URL
function buildApiUrl(baseUrl, source, songId, quality, types = 'url', urlFormat = 'query') {
  if (!baseUrl || !source || !songId) {
    throw new Error('构建API URL失败: 参数不完整');
  }
  
  const processedSongId = typeof songId !== 'string' ? String(songId) : songId;
  const params = { source, songId: processedSongId, quality };
  
  let url;
  if (urlFormat === 'path') {
    url = `${baseUrl}/${types}/${source}/${processedSongId}/${quality}`;
  } else {
    url = `${baseUrl}/${types}?${utils.buildQueryString(params)}`;
  }
  
  return url;
}

// 创建API请求函数
function createApiRequest(sourceConfig, index, signal) {
  return async (source, songId, quality) => {
    try {
      const apiName = sourceConfig.name || '';
      const targetUrl = buildApiUrl(sourceConfig.url, source, songId, quality, 'url', sourceConfig.urlFormat || 'query');
      
      const options = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,
          "X-Request-Key": sourceConfig.key || '',
        },
        follow_max: 5,
        parseResponse: false,
        signal
      };
      
      const response = await httpRequest(targetUrl, options);
      const { body } = response;
      
      if (!body || typeof body !== 'object') {
        throw new Error(`从${apiName}获取失败: 响应为空`);
      }
      
      const responseCode = Number(body.code);
      if (isNaN(responseCode) || (responseCode !== 0 && responseCode !== 200)) {
        throw new Error(`${apiName} - ${body.message || "获取失败"} (${responseCode})`);
      }
      
      let musicUrl = utils.parseResponse(body, 'url');
      if (musicUrl && typeof musicUrl === 'string') {
        musicUrl = musicUrl.replace(/\\\//g, '/');
      }
      
      if (!musicUrl) {
        throw new Error(`从${apiName}获取成功但音乐URL为空`);
      }
      
      return { success: true, data: musicUrl, index };
    } catch (error) {
      //if (error.name !== 'AbortError') {
        //logger.debug(`${sourceConfig.name || sourceConfig.url}请求失败: ${error.message}`);
      //}
      return { success: false, error };
    }
  };
}

// 请求并发控制函数
async function raceRequests(source, songId, quality, firstSource, secondSource) {
  const [ctrl1, ctrl2] = [new AbortController(), new AbortController()];
  const startTime = performance.now();
  
  const execRequest = async (sourceObj, index, signal) => {
    try {
      const reqFn = createApiRequest(sourceObj, index, signal);
      const result = await reqFn(source, songId, quality);
      const duration = performance.now() - startTime;
      
      if (result.success) {
        // 记录成功源的性能信息
        if (sourceObj && sourceObj.name) {
          logger.debug(`源 ${sourceObj.name} 请求耗时: ${duration.toFixed(2)}ms`);
        }
        // 取消另一个请求
        index === 0 ? ctrl2.abort() : ctrl1.abort();
        return result;
      }
      return result;
    } catch (err) {
      return err.name !== 'AbortError' ? { success: false, error: err } : undefined;
    }
  };
  
  // 使用数组存储所有结果，即使有一个请求成功也收集所有结果
  const results = [];
  const result = await Promise.race([
    execRequest(firstSource, 0, ctrl1.signal).then(r => {
      results[0] = r;
      return r;
    }),
    execRequest(secondSource, 1, ctrl2.signal).then(r => {
      results[1] = r;
      return r;
    })
  ]);
  
  // 确保所有请求都被终止
  ctrl1.abort();
  ctrl2.abort();
  
  // 如果第一个结果成功就返回，否则检查另一个是否成功
  if (result?.success) return result.data;
  if (results.length > 1 && results[0] !== result && results[0]?.success) {
    return results[0].data;
  }
  return null;
}

// 源可用性缓存，避免重复请求失败的源
const sourceAvailabilityCache = new Map();
const CACHE_TTL = 30000; // 缓存有效期30秒

// 从多个API源获取音乐URL
async function fetchFromMultiSourceApis(source, musicInfo, quality) {
  const { name = '未知歌曲' } = musicInfo;
  const songId = utils.getSongId(musicInfo);
  
  // 过滤掉已知不可用的源
  const availableSources = prioritizedApiSources?.filter(src => {
    const cacheKey = src.name || JSON.stringify(src);
    const cached = sourceAvailabilityCache.get(cacheKey);
    return !cached || Date.now() - cached.timestamp > CACHE_TTL;
  }) || [];
  
  // 尝试可用的API源
  if (availableSources.length > 0) {
    // 并行请求前两个可用源
    if (availableSources.length >= 2) {
      const parallelResult = await raceRequests(
        source, songId, quality,
        availableSources[0], availableSources[1]
      );
      if (parallelResult) return parallelResult;
      
      // 标记失败源
      availableSources.forEach(src => {
        const cacheKey = src.name || JSON.stringify(src);
        sourceAvailabilityCache.set(cacheKey, {
          available: false,
          timestamp: Date.now()
        });
      });
    } else if (availableSources.length === 1) {
      // 只有一个源时，直接尝试
      const requestFunc = createApiRequest(availableSources[0], 0);
      const result = await requestFunc(source, songId, quality);
      
      // 更新源可用性缓存
      const cacheKey = availableSources[0].name || JSON.stringify(availableSources[0]);
      sourceAvailabilityCache.set(cacheKey, {
        available: result.success,
        timestamp: Date.now()
      });
      
      if (result.success) return result.data;
    }
  }
  
  // 回退到GD音乐台
  const apiSource = SOURCE_MAP[source]?.api || source;
  const processedSongId = typeof songId !== 'string' ? String(songId) : songId;
  const qualityParam = STANDARD_QUALITY_MAP[quality] || quality;
  const targetUrl = `${API_BASE_URL}?types=url&source=${apiSource}&id=${processedSongId}&br=${qualityParam}`;
  
  const result = utils.parseResponse(await httpRequest(targetUrl), 'url');
  if (!result) throw new Error(`未找到音乐URL`);
  return result;
}

// 音乐资源获取主函数
const fetchMusicResource = async (source, musicInfo, quality) => {
  const startTime = Date.now();
  
  // 参数验证
  if (!source || typeof source !== 'string') throw new Error('无效的音源标识');
  if (!musicInfo || typeof musicInfo !== 'object') throw new Error('无效的音乐信息');
  
  const { songmid, name = '未知歌曲' } = musicInfo;
  
  try {
    // 检查音源是否支持
    if (source in MUSIC_QUALITY) {
      const result = await fetchFromMultiSourceApis(source, musicInfo, quality);
      
      const duration = Date.now() - startTime;
      logger.debug(`成功获取${name}的音乐URL (${duration}ms)`);
      
      return result;
    }
    
    throw new Error(`不支持从${source}获取音乐URL`);
  } catch (error) {
    const duration = Date.now() - startTime;
    
    error.source = source;
    logger.error(`获取${name}的音乐URL失败 (${duration}ms): ${error.message}`);
    
    throw DEV_ENABLE ? 
      new Error(`获取${name}的音乐URL失败: ${error.message} (source: ${source}, quality: ${quality})`) : 
      new Error(`获取${name}的音乐URL失败`);
  }
};

// 请求处理器映射
const REQUEST_HANDLERS = { musicUrl: 'url' };

// 验证请求参数
function validateRequestParams(source, action, info) {
  if (!source || !action || !info || typeof source !== 'string' || typeof action !== 'string' || typeof info !== 'object') {
    throw new Error('无效的请求参数');
  }
  
  const resourceType = REQUEST_HANDLERS[action];
  if (!resourceType || !info.musicInfo || typeof info.musicInfo !== 'object') {
    throw new Error(`不支持的动作类型: ${action} 或缺少音乐信息`);
  }
  
  if (info.type && typeof info.type !== 'string') {
    throw new Error('无效的音质参数');
  }
  
  return resourceType;
}

// 检查API连接状态
async function checkApiConnection() {
  const activeSources = API_SOURCES.filter(src => src.active && src.url);
  if (activeSources.length === 0) {
    throw new Error('没有启用的API源');
  }
  
  const sourcesWithResponseTime = [];
  const updateInfos = [];
  
  // 检查每个API源
  for (const sourceConfig of activeSources) {
    sourceConfig.scriptMd5 = sourceConfig.scriptMd5 || '';
    
    try {
      const startTime = Date.now();
      const checkUrl = `${sourceConfig.url}/script?key=${sourceConfig.key || ''}&checkUpdate=${sourceConfig.scriptMd5}`;
      
      const response = await httpRequest(checkUrl, {
        method: "GET",
        timeout: 5000,
        parseResponse: false
      });
      
      const responseTime = Date.now() - startTime;
      const { body } = response;
      
      if (body && typeof body === 'object' && (body.code === 0 || body.code === 200)) {
        sourcesWithResponseTime.push({...sourceConfig, responseTime});
        
        // 收集更新信息
        if (body.data?.updateMsg) {
          updateInfos.push({
            sourceName: sourceConfig.name,
            message: body.data.updateMsg,
            updateUrl: body.data.updateUrl || ''
          });
        }
      }
    } catch (error) {
      logger.debug(`${sourceConfig.name} 验证失败: ${error.message}`);
    }
  }
  
  if (sourcesWithResponseTime.length === 0) {
    throw new Error('所有API源均不可用');
  }
  
  // 按响应时间排序并过滤出优质源
  sourcesWithResponseTime.sort((a, b) => a.responseTime - b.responseTime);
  const sourcesWithUpdate = updateInfos.map(info => info.sourceName);
  
  prioritizedApiSources = sourcesWithResponseTime
    .filter(source => !sourcesWithUpdate.includes(source.name))
    .slice(0, 2);
  
  // 处理更新信息和优质源选择
  if (prioritizedApiSources.length === 0) {
    prioritizedApiSources = activeSources;
    
    if (send) {
      updateInfos.push({
        sourceName: '系统',
        message: '使用所有可用API源',
        updateUrl: ''
      });
    }
  }
  
  // 发送更新信息
  //if (updateInfos.length > 0 && send) {
    //const combinedLog = updateInfos.map(info => `${info.sourceName}: ${info.message}`).join('\n');
    //const firstUpdateUrl = updateInfos.find(info => info.updateUrl)?.updateUrl || '';
    
    //send(EVENT_NAMES.updateAlert, { log: combinedLog, updateUrl: firstUpdateUrl });
 //}
}

// 处理初始化
// 初始化状态检查函数
function checkInitialized() {
  if (!isInitialized) {
    throw new Error('初始化未完成禁止使用脚本');
  }
}

async function handleInit() {
  try {
    logger.debug('开始初始化各音源配置');
    const sources = {};
    for (const source of Object.keys(SOURCE_MAP)) {
      const sourceInfo = SOURCE_MAP[source];
      sources[source] = {
        name: sourceInfo.name,
        type: 'music',
        actions: ['musicUrl'],
        qualitys: source in MUSIC_QUALITY ? MUSIC_QUALITY[source] : Object.keys(STANDARD_QUALITY_MAP)
      };
    }
    
    // 进行API握手
    logger.debug('开始API握手');
    await checkApiConnection();
    
    // 设置初始化完成状态
    isInitialized = true;
    logger.debug('初始化完成');
    
    // 发送初始化完成事件
    send(EVENT_NAMES.inited, {
      openDevTools: env !== 'mobile' && DEV_ENABLE,
      sources
    });

  } catch (error) {
    logger.error('插件初始化失败', error);
    isInitialized = false;
    throw error;
  }
}

// 监听请求事件
  on(EVENT_NAMES.request, async (event) => {
    try {
      const { source, action, info } = event;

      // 为每个请求创建日志组
      logger.startGroup(`请求事件: ${action} [${source}]`);
      
      if (env !== 'mobile') {
        logger.debug(`处理动作(${action})`, { source: source, quality: info?.type, musicInfo: info?.musicInfo });
      }
      
      // 检查初始化状态
      checkInitialized();
     
      // 验证请求参数
      validateRequestParams(source, action, info);
    
    // 获取音乐资源
    return await fetchMusicResource(source, info.musicInfo, info.type);
  } catch (error) {
      logger.exception(error, '处理请求时发生错误');
      logger.endGroup();
      throw error;
    } finally {
      // 确保日志组被关闭
      logger.endGroup();
    }
  });

// 异步调用初始化
logger.startGroup('插件初始化');
handleInit().catch(error => {
  logger.error('初始化过程中发生错误', error);
}).finally(() => {
  // 确保日志组被关闭
  logger.endGroup();
});