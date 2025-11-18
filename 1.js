/**
 * @module 智能音乐源插件
 * @name 智能音乐源插件 - 合并增强版
 * @description 集成多个音乐平台的资源获取功能，支持获取音乐URL、封面和歌词
 * @features 多源API智能选择、自动重试机制、统一错误处理、歌词预处理、请求超时控制、自我更新
 * @version v1.1.0
 * @author ikucao
 * @license MIT
 */

// ========== 全局对象引用 ==========
const { lx: lxGlobal } = globalThis;
const { EVENT_NAMES, request, on, send, env, version } = lxGlobal;

// ========== 基础配置模块 ==========
const DEV_ENABLE = true; // 开发模式开关
const DEFAULT_TIMEOUT = 10000; // 默认请求超时时间（毫秒）
const SCRIPT_FILE_NAME = 'merged-music-source2_optimized.js'; // 当前脚本文件名
// 移除了更新服务器列表

// 标准音质映射表
const STANDARD_QUALITY_MAP = Object.freeze({
  '128k': '128',
  '320k': '320',
  'flac': '740',
  'flac24bit': '999'
});

// 各音乐平台支持的音质配置
const MUSIC_QUALITY = Object.freeze({
  kw: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  mg: ['128k', '320k', 'flac', 'flac24bit', 'hires'],
  kg: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  tx: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'atmos_plus', 'master'],
  wy: ['128k', '320k', 'flac', 'flac24bit', 'hires', 'atmos', 'master'],
  git: ['128k', '320k', 'flac']
});

// 音源映射表
const SOURCE_MAP = Object.freeze({
  kw: { api: 'kuwo', name: '酷我音乐' },
  kg: { api: 'kugou', name: '酷狗音乐' },
  wy: { api: 'netease', name: '网易云音乐' },
  tx: { api: 'tencent', name: 'QQ音乐' },
  mg: { api: 'migu', name: '咪咕音乐' },
  git: { api: 'git', name: 'Git音乐' },
  joox: { api: 'joox', name: 'JOOX音乐' }
});

// 远程配置获取相关常量
const REMOTE_CONFIG = Object.freeze({
  enabled: true, // 是否启用远程配置
  url: 'https://raw.githubusercontent.com/ikun-codes/config/main/music-sources.json', // 远程配置URL
  timeout: 10000, // 配置获取超时时间
  cacheExpiry: 3600000, // 缓存过期时间（1小时）
  fallbackEnabled: true, // 是否启用配置失败时的降级方案
  retryAttempts: 3, // 重试次数
  retryDelay: 2000 // 重试延迟（毫秒）
});

// 远程配置缓存
let configCache = {
  data: null,
  timestamp: 0,
  version: null
};

// 默认本地配置（降级备用）
const LOCAL_API_SOURCES = Object.freeze([
  {id: 1, url: 'http://103.217.184.26:9000', key: '', name: 'ikun公益源', active: true, urlFormat: 'query', scriptMd5: 'd7ada446a9e88d178efd7e02dc5f9879'},
  {id: 2, url: 'https://88.lxmusic.xn--fiqs8s', key: 'lxmusic', name: '洛雪音乐(备用源)', active: true, urlFormat: 'path', scriptMd5: '83b9ef5707ef3d8aadddc07749529594'},
  {id: 3, url: 'https://m-api.ceseet.me', key: '', name: 'fish_music', active: true, urlFormat: 'path', scriptMd5: '5fe365644241ca1b6a0f7ae4e333cf52'},
  {id: 4, url: 'https://api.v2.sukimon.me:19742', key: 'LXMusic_dmsowplaeq', name: '音乐服务API', active: true, urlFormat: 'path', scriptMd5: '55cecf4289b2852322a81d7ed7fe4cd9'}
]);

const LOCAL_API_BASE_URLS = [ // 本地备用API基础URL列表
  'https://music-api.gdstudio.xyz/api.php', // 备用API 1
  'https://music-dl.sayqz.com/api/' // 备用API 2
];

// API源配置表（由远程配置或本地配置初始化）
let API_SOURCES = [...LOCAL_API_SOURCES];

// 全局状态变量
let API_BASE_URLS = [...LOCAL_API_BASE_URLS]; // 备用API基础URL列表
let prioritizedApiSources = []; // 优质API源（按响应时间排序前2个）
// 移除了API源循环使用功能

// ========== 控制台输出模块 ==========
// 简化的日志输出函数
const logger = {
  debug: console.log,
  info: console.log,
  warning: console.warn,
  error: console.error,
  exception: (error, message = '') => {
    console.error(message, error.stack || error);
  }
};

// ========== 远程配置管理模块 ==========
// 验证远程配置数据格式
function validateRemoteConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('配置数据格式无效：不是有效的对象');
  }

  // 验证API源配置
  if (config.apiSources && !Array.isArray(config.apiSources)) {
    throw new Error('apiSources 字段必须是数组');
  }

  if (config.apiSources) {
    for (let i = 0; i < config.apiSources.length; i++) {
      const source = config.apiSources[i];
      if (!source.id || !source.url || !source.name) {
        throw new Error(`API源配置第${i + 1}项缺少必要字段：id、url、name`);
      }
      if (typeof source.active !== 'boolean') {
        source.active = true; // 默认启用
      }
    }
  }

  // 验证备用API配置
  if (config.backupApis && !Array.isArray(config.backupApis)) {
    throw new Error('backupApis 字段必须是数组');
  }

  if (config.backupApis) {
    for (let i = 0; i < config.backupApis.length; i++) {
      const api = config.backupApis[i];
      if (!api || typeof api !== 'string') {
        throw new Error(`备用API配置第${i + 1}项无效：必须是字符串URL`);
      }
    }
  }

  // 验证版本信息
  if (config.version && typeof config.version !== 'string') {
    throw new Error('版本信息必须是字符串');
  }

  return true;
}

// 检查缓存是否有效
function isCacheValid() {
  if (!configCache.data || !configCache.timestamp) {
    return false;
  }
  
  const now = Date.now();
  const cacheAge = now - configCache.timestamp;
  return cacheAge < REMOTE_CONFIG.cacheExpiry;
}

// 应用远程配置
function applyRemoteConfig(config) {
  try {
    // 应用API源配置
    if (config.apiSources && config.apiSources.length > 0) {
      API_SOURCES = Object.freeze([...config.apiSources]);
      logger.info(`已应用远程配置：${config.apiSources.length} 个API源`);
    }

    // 应用备用API配置
    if (config.backupApis && config.backupApis.length > 0) {
      API_BASE_URLS = [...config.backupApis];
      logger.info(`已应用远程配置：${config.backupApis.length} 个备用API`);
    }

    // 更新缓存
    configCache.data = config;
    configCache.timestamp = Date.now();
    configCache.version = config.version || '1.0.0';

    // 发送配置更新事件
    if (send && typeof send === 'function') {
      send(EVENT_NAMES.updateAlert, {
        log: `配置已更新到版本 ${configCache.version}`,
        updateUrl: ''
      });
    }

    return true;
  } catch (error) {
    logger.error('应用远程配置失败', error);
    return false;
  }
}

// 获取远程配置（带重试机制）
async function fetchRemoteConfig(forceRefresh = false) {
  // 检查是否启用远程配置
  if (!REMOTE_CONFIG.enabled) {
    logger.info('远程配置功能已禁用，使用本地配置');
    return false;
  }

  // 检查缓存有效性
  if (!forceRefresh && isCacheValid()) {
    logger.debug('使用缓存的配置数据');
    return true;
  }

  // 重试机制
  let lastError = null;
  for (let attempt = 1; attempt <= REMOTE_CONFIG.retryAttempts; attempt++) {
    try {
      logger.info(`尝试获取远程配置（第${attempt}次）...`);

      const response = await httpRequest(REMOTE_CONFIG.url, {
        method: 'GET',
        timeout: REMOTE_CONFIG.timeout,
        headers: {
          'Cache-Control': 'no-cache',
          'Accept': 'application/json',
          'User-Agent': `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`
        }
      });

      if (!response || !response.body) {
        throw new Error('服务器响应为空');
      }

      const config = response.body;
      
      // 验证配置格式
      validateRemoteConfig(config);
      
      // 应用配置
      if (applyRemoteConfig(config)) {
        logger.info(`远程配置获取成功，版本: ${config.version || '1.0.0'}`);
        return true;
      } else {
        throw new Error('配置应用失败');
      }

    } catch (error) {
      lastError = error;
      logger.warning(`远程配置获取第${attempt}次失败: ${error.message}`);
      
      // 如果不是最后一次尝试，等待后重试
      if (attempt < REMOTE_CONFIG.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, REMOTE_CONFIG.retryDelay));
      }
    }
  }

  // 所有重试都失败
  logger.error(`远程配置获取失败，已重试${REMOTE_CONFIG.retryAttempts}次: ${lastError?.message}`);

  // 如果启用了降级机制，使用本地配置
  if (REMOTE_CONFIG.fallbackEnabled) {
    logger.info('使用本地配置作为降级方案');
    API_SOURCES = [...LOCAL_API_SOURCES];
    API_BASE_URLS = [...LOCAL_API_BASE_URLS];
    
    // 发送警告事件
    if (send && typeof send === 'function') {
      send(EVENT_NAMES.updateAlert, {
        log: `远程配置获取失败，使用本地配置。错误: ${lastError?.message}`,
        updateUrl: ''
      });
    }
    return false;
  }

  throw new Error(`远程配置获取失败: ${lastError?.message}`);
}

// 刷新配置功能
function refreshConfig() {
  logger.info('手动刷新远程配置');
  return fetchRemoteConfig(true);
}

// ========== 工具函数模块 ==========
const utils = {
  // 解析歌曲ID
  getSongId(musicInfo) {
    const songId = musicInfo.hash ?? musicInfo.songmid ?? musicInfo.id;
    if (!songId || (typeof songId === 'string' && /^\s*$/.test(songId))) {
      throw new Error('无效的音乐信息: 缺少有效ID');
    }
    return typeof songId !== 'string' ? String(songId) : songId;
  },

  // 预处理歌词数据
  preprocessLyric(lyric) {
    if (typeof lyric !== 'string' || lyric.includes('\n')) return lyric;
    try {
      const parsed = JSON.parse(lyric);
      return parsed.lyric || parsed.data?.lyric || lyric;
    } catch { return lyric; }
  },

  // 解析API响应数据
  parseResponse(data, types) {
    if (!data || typeof data !== 'object') return null;
    switch (types) {
      case 'url': return data.url ?? data.data?.url ?? null;
      case 'pic': return data.pic ?? data.data?.pic ?? data.url ?? data.data?.url ?? null;
      case 'lyric': return data.lyric ?? data.data?.lyric ?? null;
      default: return null;
    }
  }
};

// ========== 自我更新模块已移除 ==========

// ========== HTTP请求模块 ==========
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
function httpMergeOptions(options = {}) {
  const mergedOptions = {...HTTP_DEFAULT_OPTIONS, ...options};
  if (options.headers) {
    mergedOptions.headers = {...HTTP_DEFAULT_OPTIONS.headers, ...options.headers};
  }
  return mergedOptions;
}

// 请求超时处理函数
function httpTimeoutRequest(url, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      logger.warning(`请求超时: ${url} (${timeoutMs}ms)`);
      reject(new Error(`请求超时: ${timeoutMs}ms`));
    }, timeoutMs);
    
    // 处理AbortController的signal参数
    const signal = options?.signal;
    if (signal && signal.aborted) {
      clearTimeout(timeoutId);
      return reject(new Error('请求已取消'));
    }
    
    // 创建abort事件处理函数
    let onAbort;
    let isAborted = false;
    
    if (signal) {
      onAbort = () => {
        clearTimeout(timeoutId);
        isAborted = true;
        reject(new Error('请求已取消'));
      };
      signal.addEventListener('abort', onAbort);
    }
    
    // 发送请求
    request(url, options, (error, resp) => {
      // 如果请求已经被取消，直接返回
      if (isAborted) return;
      
      clearTimeout(timeoutId);
      if (signal) signal.removeEventListener('abort', onAbort);
      
      if (error) {
        logger.warning(`请求失败: ${url}`, { error: error.message });
        return reject(error);
      }
      if (resp.statusCode !== 200 && resp.statusCode !== 0) {
        const statusError = new Error(`HTTP ${resp.statusCode}`);
        logger.warning(`请求返回非成功状态: ${url}`, { statusCode: resp.statusCode });
        return reject(statusError);
      }
      resolve(resp);
    });
  });
}

// HTTP请求函数
const httpRequest = async (url, options = {}) => {
  const startTime = Date.now();
  try {
    if (!url || typeof url !== 'string' || !url.trim()) {
      throw new Error('无效的URL参数');
    }
    
    const requestOptions = httpMergeOptions(options);
    const timeoutMs = requestOptions.timeout || DEFAULT_TIMEOUT;
    
    logger.debug(`发送请求: ${url}`, { method: requestOptions.method });
    const response = await httpTimeoutRequest(url, requestOptions, timeoutMs);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.debug(`请求完成: ${url}`, { duration: `${duration}ms`, status: 'success' });
    return response;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    logger.error(`请求失败: ${url}`, { error: error.message, duration: `${duration}ms` });
    throw error;
  }
};

// ========== API URL构建模块 ==========
// 构建查询字符串
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([key, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
}

// 通用错误处理函数
function throwWithLogging(message, context = {}) {
  const error = new Error(message);
  logger.error('构建API URL失败', { error: error.message, ...context });
  throw error;
}

// 构建API URL
function buildApiUrl(baseUrl, source, songId, quality, types = 'url', urlFormat = 'query', customParams = {}) {
  // 验证参数
  if (!baseUrl || typeof baseUrl !== 'string') {
    throwWithLogging('无效的基础URL参数', { baseUrl });
  }
  if (!source || typeof source !== 'string') {
    throwWithLogging('无效的音源参数', { source });
  }
  if (songId === null || songId === undefined || (typeof songId === 'string' && /^\s*$/.test(songId))) {
    throwWithLogging('无效的音乐ID: ID不能为空', { source });
  }
  
  const processedSongId = typeof songId !== 'string' ? String(songId) : songId;
  
  if (!types || typeof types !== 'string' || !['url', 'pic', 'lyric'].includes(types)) {
    throwWithLogging('无效的types参数，支持的值: url, pic, lyric', { source, types });
  }
  if (!urlFormat || typeof urlFormat !== 'string' || !['query', 'path'].includes(urlFormat)) {
    throwWithLogging('无效的urlFormat参数，支持的值: query, path', { urlFormat });
  }
  
  // 构建查询参数
  const params = {
    types,
    source,
    songId: processedSongId,
    ...customParams
  };
  
  // 为URL请求添加音质参数
  if (types === 'url') {
    params.quality = quality;
  }
  // URL构建逻辑
  let url;
  if (urlFormat === 'path') {
    url = `${baseUrl}/${types}/${source}/${processedSongId}/${quality}`; // 路径格式
  } else {
    // 所有查询参数格式：将types转为路径的一部分，并从params中移除types参数
    const { types: _, ...queryParams } = params;
    url = `${baseUrl}/${types}?${buildQueryString(queryParams)}`;
  }
  
  logger.debug('构建API URL完成', { source, songId: processedSongId, types, quality: types === 'url' ? quality : 'N/A', url, urlFormat });
  return url;
}

// ========== 音乐资源获取核心模块 ==========
// 资源类型映射
const RESOURCE_TYPES = { url: 'URL', pic: '封面', lyric: '歌词' };

// 创建可取消的API请求
function createApiRequest(sourceConfig, index, signal) {
  return async (source, songId, quality, types) => {
    try {
      const targetUrl = buildApiUrl(sourceConfig.url, source, songId, quality, types, sourceConfig.urlFormat || 'query');
      const apiName = sourceConfig.name || '';
      
      const options = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,
          "X-Request-Key": sourceConfig.key || '',
        },
        follow_max: 5,
        parseResponse: false,
        signal // 传递取消信号
      };
      
      logger.debug(`尝试从${apiName}获取音乐URL: ${sourceConfig.url}`);
      const response = await httpRequest(targetUrl, options);
      const { body } = response;
      
      if (!body) {
        throw new Error(`从${apiName}获取失败: 响应为空`);
      }
      
      const responseCode = Number(body.code);
      if (isNaN(responseCode)) {
        throw new Error(`从${apiName}获取失败: 无效的响应码`);
      }
      
      switch (responseCode) {
        case 0:
        case 200:
          // 处理URL，将可能存在的转义斜杠(\/)转换为正常斜杠(/)
          const urlValue = body.url || body.data;
          const musicUrl = urlValue ? urlValue.replace(/\\\//g, '/') : null;
          if (!musicUrl) {
            throw new Error(`从${apiName}获取成功但URL为空`);
          }
          logger.debug(`从${apiName}获取${source}_${songId}成功, URL: ${musicUrl}`);
          return { success: true, data: musicUrl, index };
        case 403: throw new Error(`${apiName} - Key失效/鉴权失败`);
        case 422: throw new Error(`${apiName} - 无法处理的实体，请求参数可能不正确`);
        case 429: throw new Error(`${apiName} - 请求过速`);
        case 500: throw new Error(`${apiName} - 获取URL失败, ${body.message ?? "未知错误"}`);
        default: throw new Error(`${apiName} - 错误码: ${responseCode}, ${body.message ?? "未知错误"}`);
      }
    } catch (error) {
      logger.warning(`${sourceConfig.name || sourceConfig.url}请求失败: ${error.message}`);
      return { success: false, error };
    }
  };
}

// 请求竞争处理函数
async function raceWithResultCheck(source, songId, quality, firstSource, secondSource, firstIndex, secondIndex) {
  // 使用AbortController实现请求取消
  const controller1 = new AbortController();
  const controller2 = new AbortController();
  
  // 创建带取消信号的请求函数
  const firstRequest = createApiRequest(firstSource, firstIndex, controller1.signal);
  const secondRequest = createApiRequest(secondSource, secondIndex, controller2.signal);
  
  // 创建可取消的请求包装
  const cancelableRequest1 = async () => {
    try {
      const result = await firstRequest(source, songId, quality, 'url');
      if (result.success) controller2.abort(); // 成功时取消另一个请求
      return { ...result, order: 1 };
    } catch (error) {
      // 处理取消错误
      if (error.name !== 'AbortError') {
        const result = { success: false, error, order: 1 };
        return result;
      } else {
        error = null; // 清除 error 的值
      }
      // 忽略取消错误，因为这是正常的控制流程
    }
  };
  
  const cancelableRequest2 = async () => {
    try {
      const result = await secondRequest(source, songId, quality, 'url');
      if (result.success) controller1.abort(); // 成功时取消另一个请求
      return { ...result, order: 2 };
    } catch (error) {
      // 处理取消错误
      if (error.name !== 'AbortError') {
        return { success: false, error, order: 2 };
      }
      // 忽略取消错误，因为这是正常的控制流程
    }
  };
  
  try {
    // 使用Promise.race实现真正的竞争，有一个成功就立即返回
    const result = await Promise.race([
      cancelableRequest1(),
      cancelableRequest2()
    ]);
    
    if (result && result.success) {
      return result.data;
    }
  } catch (error) {
    // 忽略故意取消的错误
    if (!error || !error.message.includes('Request aborted intentionally')) {
      logger.warning(`请求竞争过程中发生错误: ${error?.message || '未知错误'}`);
    }
  }
  
  // 确保两个请求都被取消
  controller1.abort();
  controller2.abort();
  
  // 如果执行到这里，表示两个请求都失败了或被取消了
  return null;
}

// 从多个API源获取音乐URL（自动故障转移与并行请求优化）
async function fetchFromMultiSourceApis(source, musicInfo, quality) {
  const { name = '未知歌曲' } = musicInfo;
  const songId = utils.getSongId(musicInfo);
  const types = 'url';
  const resourceType = RESOURCE_TYPES[types];
  
  // 尝试所有优质API源
  if (prioritizedApiSources && prioritizedApiSources.length > 0) {
    const sourceCount = prioritizedApiSources.length;
    // 直接使用原顺序的API源
    const usageOrder = [];
    for (let i = 0; i < sourceCount; i++) usageOrder.push(i);
    
    // 优先尝试并行请求前两个优质源
    if (usageOrder.length >= 2) {
      const [firstSource, secondSource] = [prioritizedApiSources[usageOrder[0]], prioritizedApiSources[usageOrder[1]]];
      
      // 尝试并行请求
      const parallelResult = await raceWithResultCheck(
        source, songId, quality, 
        firstSource, secondSource, 
        usageOrder[0], usageOrder[1]
      );
      if (parallelResult) return parallelResult;
      
      // 如果并行请求失败，从第三个源开始按顺序尝试
      for (let j = 2; j < usageOrder.length; j++) {
        const i = usageOrder[j];
        const requestFunc = createApiRequest(prioritizedApiSources[i], i);
        const result = await requestFunc(source, songId, quality, types);
        if (result.success) {
          return result.data;
        }
      }
    } else {
      // 如果只有一个源或没有源，则按原来的顺序尝试
      for (let j = 0; j < usageOrder.length; j++) {
        const i = usageOrder[j];
        const requestFunc = createApiRequest(prioritizedApiSources[i], i);
        const result = await requestFunc(source, songId, quality, types);
        if (result.success) {
          return result.data;
        }
      }
    }
    
    logger.error('所有优质API源已尝试完毕');
  }
  
  // 所有API源都失败后，尝试使用备用API源（并发请求）
  const apiSource = SOURCE_MAP[source]?.api || source;
  const processedSongId = typeof songId !== 'string' ? String(songId) : songId;
  
  // 为每个备用API创建请求函数
  const createBackupApiRequest = (apiBaseUrl, index) => {
    return async () => {
      let targetUrl;
      
      // 统一使用标准URL格式构建请求URL
      targetUrl = `${apiBaseUrl}?types=${types}&source=${apiSource}&id=${processedSongId}`;
      if (types === 'url') {
        const qualityParam = STANDARD_QUALITY_MAP[quality] || quality;
        targetUrl += `&br=${qualityParam}`;
      }
      
      try {
        logger.info(`正在从备用API ${index+1} 获取${name}的${resourceType}`, { source, songId, quality, apiUrl: apiBaseUrl });
        const result = utils.parseResponse(await httpRequest(targetUrl), types);
        
        if (result) {
          logger.debug(`成功从备用API ${index+1} 获取${name}的${resourceType}`, { songId, apiUrl: apiBaseUrl });
          return { success: true, data: result, index };
        }
        return { success: false, index };
      } catch (error) {
        logger.warning(`备用API ${index+1} 请求失败: ${error.message}`, { apiUrl: apiBaseUrl });
        return { success: false, error, index };
      }
    };
  };
  
  // 创建所有备用API的请求任务
  const requests = API_BASE_URLS.map((apiBaseUrl, index) => createBackupApiRequest(apiBaseUrl, index));
  
  // 使用现代Promise API实现并发请求，获取第一个成功结果
  try {
    // 创建带超时的请求Promise数组
    const requestPromises = requests.map(requestFn => {
      return new Promise(async (resolve, reject) => {
        try {
          const result = await requestFn();
          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(`请求失败，索引: ${result.index}`));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    // 使用Promise.race获取第一个成功的请求
    // 同时使用Promise.allSettled确保所有请求完成并收集错误信息
    let successfulResult = null;
    const allSettledPromise = Promise.allSettled(requestPromises).then(results => {
      const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message)
        .join(', ');
      
      if (!successfulResult) {
        throw new Error(`所有备用API获取${name}的${resourceType}都失败了: ${errors}`);
      }
    });
    
    try {
      // 优先等待第一个成功的请求
      successfulResult = await Promise.race(requestPromises);
      return successfulResult.data;
    } catch (raceError) {
      // 如果race抛出错误，等待所有请求完成以获取完整错误信息
      await allSettledPromise;
    }
  } catch (error) {
    logger.error(`备用API请求处理失败: ${error.message}`);
    throw error;
  }
}

// 音乐资源获取主函数
const fetchMusicResource = async (source, musicInfo, quality, types) => {
  const startTime = Date.now();
  
  // 参数验证
  if (!source || typeof source !== 'string') throw new Error('无效的音源标识');
  if (!musicInfo || typeof musicInfo !== 'object') throw new Error('无效的音乐信息');
  if (!types || typeof types !== 'string') throw new Error('无效的资源类型');
  
  // 获取歌曲信息
  const { songmid, name = '未知歌曲' } = musicInfo;
  const resourceType = RESOURCE_TYPES[types] || types;
  
  // 记录请求信息
  logger.info(`开始获取资源`, {
    source,
    songName: name,
    resourceType,
    quality: quality || '默认',
    songmid
  });

  try {
    // 对于音乐URL，优先尝试多API源获取
    if (types === 'url' && source in MUSIC_QUALITY) {
      logger.debug(`尝试从多API源获取${name}的${resourceType}: ${source}`);
      const result = await fetchFromMultiSourceApis(source, musicInfo, quality);
      
      // 记录请求完成信息和耗时
      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.info(`成功从多API源获取${name}的${resourceType}`, {
        source,
        quality,
        duration: `${duration}ms`
      });
      
      return result;
    }
    
    // 对于非音乐URL或不在MUSIC_QUALITY中的音源，抛出错误
    throw new Error(`不支持从${source}获取${resourceType}类型的资源`);
  } catch (error) {
    // 记录请求失败信息和耗时
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    error.source = source;
    const errorMessage = `获取${name}的${resourceType}失败`;
    
    logger.error(errorMessage, {
      source,
      error: error.message,
      musicInfo: { songmid, name },
      resourceType,
      quality,
      duration: `${duration}ms`
    });
    
    // 在开发模式下，提供更详细的错误信息
    if (DEV_ENABLE) {
      throw new Error(`${errorMessage}: ${error.message} (source: ${source}, quality: ${quality})`);
    } else {
      throw new Error(errorMessage);
    }
  }
};

// ========== 请求处理模块 ==========
// 请求处理器映射
const REQUEST_HANDLERS = { musicUrl: 'url', lyric: 'lyric', pic: 'pic' };

// 验证请求参数并返回资源类型
function validateRequestParams(source, action, info) {
  // 验证音源
  if (!source || typeof source !== 'string') throw new Error('无效的音源标识');
  // 验证动作
  if (!action || typeof action !== 'string') throw new Error('无效的动作类型');
  // 验证信息
  if (!info || typeof info !== 'object') throw new Error('无效的请求信息');
  
  // 获取资源类型
  const resourceType = REQUEST_HANDLERS[action];
  if (!resourceType) throw new Error(`不支持的动作类型: ${action}`);
  
  // 验证音乐信息
  if (!info.musicInfo || typeof info.musicInfo !== 'object') throw new Error('无效的音乐信息');
  
  // 如果是音乐URL请求，验证音质
  if (action === 'musicUrl' && info.type && typeof info.type !== 'string') throw new Error('无效的音质参数');
  
  return resourceType;
}

// 监听请求事件
on(EVENT_NAMES.request, async (event) => {
  try {
    const { source, action, info } = event;
    
    if (env !== 'mobile') {
      logger.debug(`处理动作(${action})`, { source, quality: info?.type, musicInfo: info?.musicInfo });
    }
    
    // 验证请求参数并获取资源类型
    const resourceType = validateRequestParams(source, action, info);
    
    // 获取音乐资源并返回
    return await fetchMusicResource(source, info.musicInfo, info.type, resourceType);
  } catch (error) {
    logger.exception(error, '处理请求时发生错误');
    throw error;
  }
});

// ========== 插件初始化模块 ==========
// 默认支持的操作
const DEFAULT_ACTIONS = ['musicUrl'];
// 本地音乐支持的操作
const LOCAL_ACTIONS = ['musicUrl', 'lyric', 'pic'];

// 音源配置对象
const sources = {};
const sourceKeys = Object.keys(SOURCE_MAP);

// 初始化各音源配置
for (const source of sourceKeys) {
  const sourceInfo = SOURCE_MAP[source];
  
  // 获取该音源支持的音质列表
  const qualitys = source in MUSIC_QUALITY ? MUSIC_QUALITY[source] : Object.keys(STANDARD_QUALITY_MAP);
  
  // 配置音源信息
  sources[source] = {
    name: sourceInfo.name,
    type: 'music',
    actions: DEFAULT_ACTIONS,
    qualitys: qualitys
  };
}

// 添加本地音乐支持
sources.local = {
  name: '本地音乐',
  type: 'music',
  actions: LOCAL_ACTIONS,
  qualitys: []
};

// 初始化参数
const initParams = {
  openDevTools: env !== 'mobile' && DEV_ENABLE, // 非移动端且开发模式下打开开发者工具
  sources: sources
};

// 检查API连接状态并记录响应时间
async function checkApiConnection() {
  // 过滤出启用的源
  const sources = API_SOURCES.filter(src => src.active && src.url);
  
  if (sources.length === 0) {
    throw new Error('没有启用的API源');
  }
  
  // 记录成功的API源及其响应时间
  const availableSources = [];
  const sourcesWithResponseTime = [];
  // 收集所有API源的更新信息，用于统一发送
  const updateInfos = [];
  
  // 按顺序检查所有API源，只尝试1次，且只处理有scriptMd5的源
  for (const sourceConfig of sources) {
    // 忽略没有scriptMd5的源
    if (!sourceConfig.scriptMd5) {
      logger.info(`${sourceConfig.name} 没有scriptMd5参数，忽略此源`);
      continue;
    }
    
    try {
      // 记录开始时间
      const startTime = Date.now();
      let response, body;
      
      // 使用更新检查方式进行验证
      const checkUrl = `${sourceConfig.url}/script?key=${sourceConfig.key || ''}&checkUpdate=${sourceConfig.scriptMd5}`;
      const options = {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": `${env ? `lx-music-${env}/${version}` : `lx-music-request/${version}`}`,
        },
        timeout: 5000, // 超时时间5秒
        parseResponse: false
      };

      logger.info(`正在检查${sourceConfig.name}的更新状态...`);
      response = await httpRequest(checkUrl, options);
      body = response.body;
      
      // 计算响应时间（毫秒）
      const responseTime = Date.now() - startTime;
      
      if (!body || typeof body !== 'object') {
        throw new Error(`响应为空或格式错误`);
      }
      
      if (body.code === 0 || body.code === 200) {
        availableSources.push(sourceConfig.name);
        sourcesWithResponseTime.push({...sourceConfig, responseTime});
        logger.info(`${sourceConfig.name} 验证成功，响应时间: ${responseTime}ms`);
        
        // 收集更新信息，不立即发送 - 只收集真正有更新消息的源
        if (body.data && body.data.updateMsg) {
          updateInfos.push({
            sourceName: sourceConfig.name,
            message: body.data.updateMsg,
            updateUrl: body.data.updateUrl || ''
          });
        }
      } else {
        throw new Error(`验证失败: ${body.message || `状态码 ${body.code}`}`);
      }
    } catch (error) {
      logger.warning(`${sourceConfig.name} 验证失败: ${error.message}`);
    }
  }
  
  const allFailed = sourcesWithResponseTime.length === 0;
  
  if (allFailed) {
    throw new Error('所有API源均不可用，请检查网络连接或API配置');
  } else if (availableSources.length > 0) {
    // 按响应时间升序排序（最快的在前）
    sourcesWithResponseTime.sort((a, b) => a.responseTime - b.responseTime);
    
    // 获取有更新消息的源名称列表
    const sourcesWithUpdate = updateInfos.map(info => info.sourceName);
    
    // 过滤出没有更新消息的源，再取2个响应时间最快的作为优质源
    prioritizedApiSources = sourcesWithResponseTime
      .filter(source => !sourcesWithUpdate.includes(source.name))
      .slice(0, 2);
    
    // 如果没有优质API源，显示弹窗警告
    if (prioritizedApiSources.length === 0) {
      prioritizedApiSources = API_SOURCES.filter(src => src.active && src.url);
      
      // 显示弹窗警告
      if (send && typeof send === 'function') {
        logger.warning('没有找到优质API源，将使用所有可用API源');
        updateInfos.push({
          sourceName: '系统',
          message: '没有找到响应速度较快的优质API源，将使用所有可用API源',
          updateUrl: ''
        });
      }
    }
    
    // 统一发送所有更新信息
    if (updateInfos.length > 0 && send && typeof send === 'function') {
      // 合并所有更新消息
      const combinedLog = updateInfos.map(info => `${info.sourceName}: ${info.message}`).join('\n');
      // 只使用第一个有URL的更新链接
      const firstUpdateWithUrl = updateInfos.find(info => info.updateUrl);
      const firstUpdateUrl = firstUpdateWithUrl ? firstUpdateWithUrl.updateUrl : '';
      
      send(EVENT_NAMES.updateAlert, {
        log: combinedLog,
        updateUrl: firstUpdateUrl
      });
    }
    
    logger.info(`API验证完成，可用的API源: ${availableSources.join(', ')}`);
    logger.info(`优质API源排序（响应时间）: ${prioritizedApiSources.map(src => `${src.name}(${src.responseTime}ms)`).join(', ')}`);
  } else {
    // 如果没有成功的API源，但不是全部失败（可能有部分失败），使用原始配置的API源
    prioritizedApiSources = sources;
  }
}

// 处理初始化
async function handleInit() {
  try {
    // 优先获取远程配置
    logger.info('开始初始化智能音乐源插件...');
    
    // 尝试获取远程配置
    try {
      await fetchRemoteConfig(false);
      logger.info('远程配置获取完成');
    } catch (error) {
      logger.warning('远程配置获取失败，将使用本地配置', error);
    }

    // 发送初始化完成事件
    send(EVENT_NAMES.inited, initParams);

    // 记录初始化信息
    const platformInfo = env === 'mobile' ? '移动端' : '桌面端';
    logger.info(`智能音乐源插件 - 合并增强版 v1.1.0 初始化完成，运行平台: ${platformInfo}`);
    logger.info(`支持的音源: ${Object.keys(SOURCE_MAP).filter(k => typeof SOURCE_MAP[k] === 'object').map(k => SOURCE_MAP[k].name).join(', ')}`);
    logger.info(`当前使用的API源配置: ${API_SOURCES.filter(src => src.active).length} 个源已启用`);
    logger.info(`当前使用的备用API配置: ${API_BASE_URLS.length} 个备用API`);

    // 进行API握手，确保API可用
    await checkApiConnection();
    
  } catch (error) {
    logger.error('插件初始化失败', error);
    throw error;
  }
}

// 防御性日志记录，避免logger.debug不是函数时崩溃
(typeof logger.debug === 'function' ? logger.debug : console.log)('音源配置完成', { sourceCount: sourceKeys.length + 1 });

// 异步调用handleInit
handleInit().catch(error => {
  logger.error('初始化过程中发生错误', error);
});