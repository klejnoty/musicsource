"use strict";
/*
 * 小秋音乐(QQ音乐)插件
 * 提供QQ音乐的搜索、专辑、歌手、歌单等功能
 * 作者: ikucao
 * 版本: 1.0.0
 */
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = require("axios");
const CryptoJs = require("crypto-js");
const he = require("he");

// 每页数据大小
const pageSize = 20;
/**
 * 格式化音乐项目数据
 * @param {Object} _ - 原始音乐数据
 * @returns {Object} 格式化后的音乐数据
 */
function formatMusicItem(_) {
    console.log(`[小秋音乐] 格式化音乐项目: ${_.title || _.songname || "未知"}`);
    var _a, _b, _c;
    const albumid = _.albumid || ((_a = _.album) === null || _a === void 0 ? void 0 : _a.id);
    const albummid = _.albummid || ((_b = _.album) === null || _b === void 0 ? void 0 : _b.mid);
    const albumname = _.albumname || ((_c = _.album) === null || _c === void 0 ? void 0 : _c.title);
    
    const artist = _.singer.map((s) => s.name).join(", ");
    
    const result = {
        id: _.id || _.songid,
        songmid: _.mid || _.songmid,
        title: _.title || _.songname,
        artist: artist,
        artwork: albummid
            ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${albummid}.jpg`
            : undefined,
        album: albumname,
        lrc: _.lyric || undefined,
        albumid: albumid,
        albummid: albummid,
    };
    
    console.log(`[小秋音乐] 格式化音乐项目完成: ${result.title} - ${result.artist}`);
    return result;
}
/**
 * 格式化专辑项目数据
 * @param {Object} _ - 原始专辑数据
 * @returns {Object} 格式化后的专辑数据
 */
function formatAlbumItem(_) {
    console.log(`[小秋音乐] 格式化专辑项目: ${_.albumName || _.album_name || "未知"}`);
    
    const result = {
        id: _.albumID || _.albumid,
        albumMID: _.albumMID || _.album_mid,
        title: _.albumName || _.album_name,
        artwork: _.albumPic ||
            `https://y.gtimg.cn/music/photo_new/T002R800x800M000${_.albumMID || _.album_mid}.jpg`,
        date: _.publicTime || _.pub_time,
        singerID: _.singerID || _.singer_id,
        artist: _.singerName || _.singer_name,
        singerMID: _.singerMID || _.singer_mid,
        description: _.desc,
    };
    
    console.log(`[小秋音乐] 格式化专辑项目完成: ${result.title} - ${result.artist}`);
    return result;
}
/**
 * 格式化歌手项目数据
 * @param {Object} _ - 原始歌手数据
 * @returns {Object} 格式化后的歌手数据
 */
function formatArtistItem(_) {
    console.log(`[小秋音乐] 格式化歌手项目: ${_.singerName || "未知"}`);
    
    const result = {
        name: _.singerName,
        id: _.singerID,
        singerMID: _.singerMID,
        avatar: _.singerPic,
        worksNum: _.songNum,
    };
    
    console.log(`[小秋音乐] 格式化歌手项目完成: ${result.name}`);
    return result;
}
// 搜索类型映射表 - 将数字类型ID映射到对应的资源类型
const searchTypeMap = {
    0: "song",      // 歌曲搜索类型
    2: "album",     // 专辑搜索类型
    1: "singer",    // 歌手搜索类型
    3: "songlist",  // 歌单搜索类型
    7: "song",      // 另一种歌曲搜索类型
    12: "mv",       // MV搜索类型
};

// HTTP请求头配置
const headers = {
    referer: "https://y.qq.com",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36",
    Cookie: "uin=",
};
/**
 * 基础搜索函数 - 调用QQ音乐搜索API
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @param {number} type - 搜索类型ID
 * @returns {Promise<Object>} 搜索结果，包含isEnd和data字段
 */
async function searchBase(query, page, type) {
    console.log(`[小秋音乐] 开始基础搜索: 关键词='${query}', 页码=${page}, 类型ID=${type}`);
    try {
        // 检查搜索类型是否有效
        const searchTypeName = searchTypeMap[type];
        if (!searchTypeName) {
            console.log(`[小秋音乐] 搜索类型不存在: ID=${type}`);
            return { data: [], isEnd: true };
        }
        
        // 构建请求参数
        const requestData = {
            req_1: {
                method: "DoSearchForQQMusicDesktop",
                module: "music.search.SearchCgiService",
                param: {
                    num_per_page: pageSize,
                    page_num: page,
                    query: query,
                    search_type: type,
                },
            },
        };
        
        console.log(`[小秋音乐] 发送搜索请求: API= https://u.y.qq.com/cgi-bin/musicu.fcg, 类型=${searchTypeName}`);
        const res = (await (0, axios_1.default)({
            url: "https://u.y.qq.com/cgi-bin/musicu.fcg",
            method: "POST",
            data: requestData,
            headers: headers,
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 解析搜索结果
        const totalCount = res.req_1.data.meta.sum;
        const resultList = res.req_1.data.body[searchTypeName].list;
        const isEnd = totalCount <= page * pageSize;
        
        console.log(`[小秋音乐] 基础搜索完成: 关键词='${query}', 找到${totalCount}条结果, 本页${resultList.length}条, 是否结束=${isEnd}`);
        return {
            isEnd: isEnd,
            data: resultList,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索出错: 关键词='${query}', 错误=${e.message}`);
        return { data: [], isEnd: true };
    }
}
/**
 * 搜索音乐
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @returns {Promise<Object>} 搜索结果，包含isEnd和格式化后的音乐列表
 */
async function searchMusic(query, page) {
    console.log(`[小秋音乐] 搜索音乐: 关键词='${query}', 页码=${page}`);
    try {
        const res = await searchBase(query, page, 0);
        
        // 格式化音乐数据
        const formattedData = res.data.map((item) => formatMusicItem(item));
        
        console.log(`[小秋音乐] 搜索音乐完成: 关键词='${query}', 页码=${page}, 找到${formattedData.length}条结果`);
        return {
            isEnd: res.isEnd,
            data: formattedData,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索音乐出错: 关键词='${query}', 错误=${e.message}`);
        return {
            isEnd: true,
            data: [],
        };
    }
}
/**
 * 搜索专辑
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @returns {Promise<Object>} 搜索结果，包含isEnd和格式化后的专辑列表
 */
async function searchAlbum(query, page) {
    console.log(`[小秋音乐] 搜索专辑: 关键词='${query}', 页码=${page}`);
    try {
        const res = await searchBase(query, page, 2);
        
        // 格式化专辑数据
        const formattedData = res.data.map((item) => formatAlbumItem(item));
        
        console.log(`[小秋音乐] 搜索专辑完成: 关键词='${query}', 页码=${page}, 找到${formattedData.length}条结果`);
        return {
            isEnd: res.isEnd,
            data: formattedData,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索专辑出错: 关键词='${query}', 错误=${e.message}`);
        return {
            isEnd: true,
            data: [],
        };
    }
}
/**
 * 搜索歌手
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @returns {Promise<Object>} 搜索结果，包含isEnd和格式化后的歌手列表
 */
async function searchArtist(query, page) {
    console.log(`[小秋音乐] 搜索歌手: 关键词='${query}', 页码=${page}`);
    try {
        const res = await searchBase(query, page, 1);
        
        // 格式化歌手数据
        const formattedData = res.data.map((item) => formatArtistItem(item));
        
        console.log(`[小秋音乐] 搜索歌手完成: 关键词='${query}', 页码=${page}, 找到${formattedData.length}条结果`);
        return {
            isEnd: res.isEnd,
            data: formattedData,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索歌手出错: 关键词='${query}', 错误=${e.message}`);
        return {
            isEnd: true,
            data: [],
        };
    }
}
/**
 * 搜索歌单
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @returns {Promise<Object>} 搜索结果，包含isEnd和格式化后的歌单列表
 */
async function searchMusicSheet(query, page) {
    console.log(`[小秋音乐] 搜索歌单: 关键词='${query}', 页码=${page}`);
    try {
        const musicSheet = await searchBase(query, page, 3);
        
        // 格式化歌单数据
        const formattedData = musicSheet.data.map((item) => ({
            id: item.dissid,
            title: item.dissname,
            artwork: item.imgurl,
            description: item.introduction,
            playCount: item.listennum,
            createAt: item.createtime,
            worksNums: item.song_count,
            artist: item.creator?.name || "未知",
        }));
        
        console.log(`[小秋音乐] 搜索歌单完成: 关键词='${query}', 页码=${page}, 找到${formattedData.length}条结果`);
        return {
            isEnd: musicSheet.isEnd,
            data: formattedData,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索歌单出错: 关键词='${query}', 错误=${e.message}`);
        return {
            isEnd: true,
            data: [],
        };
    }
}
/**
 * 搜索歌词
 * @param {string} query - 搜索关键词
 * @param {number} page - 页码
 * @returns {Promise<Object>} 搜索结果，包含isEnd和格式化后的音乐列表
 */
async function searchLyric(query, page) {
    console.log(`[小秋音乐] 搜索歌词: 关键词='${query}', 页码=${page}`);
    try {
        const songs = await searchBase(query, page, 7);
        
        // 格式化音乐数据（歌词搜索返回的是带歌词的音乐）
        const formattedData = songs.data.map((it) => (Object.assign(Object.assign({}, formatMusicItem(it)), { rawLrcTxt: it.content })));
        
        console.log(`[小秋音乐] 搜索歌词完成: 关键词='${query}', 页码=${page}, 找到${formattedData.length}条结果`);
        return {
            isEnd: songs.isEnd,
            data: formattedData,
        };
    } catch (e) {
        console.error(`[小秋音乐] 搜索歌词出错: 关键词='${query}', 错误=${e.message}`);
        return {
            isEnd: true,
            data: [],
        };
    }
}
/**
 * 从URL中获取查询参数
 * @param {string} key - 要获取的参数名
 * @param {string} [search] - URL的查询部分
 * @returns {string|Object|undefined} 查询参数的值或所有参数对象
 */
function getQueryFromUrl(key, search) {
    console.log(`[小秋音乐] 从URL获取参数: key=${key}`);
    try {
        const sArr = search.split("?");
        let s = "";
        if (sArr.length > 1) {
            s = sArr[1];
        }
        else {
            const emptyResult = key ? undefined : {};
            console.log(`[小秋音乐] 从URL获取参数完成: key=${key}, value=${emptyResult}`);
            return emptyResult;
        }
        const querys = s.split("&");
        const result = {};
        querys.forEach((item) => {
            const temp = item.split("=");
            result[temp[0]] = decodeURIComponent(temp[1]);
        });
        const finalResult = key ? result[key] : result;
        console.log(`[小秋音乐] 从URL获取参数完成: key=${key}, value=${finalResult}`);
        return finalResult;
    }
    catch (err) {
        const errorResult = key ? "" : {};
        console.error(`[小秋音乐] 从URL获取参数出错: key=${key}, error=${err.message}`);
        return errorResult;
    }
}
/**
 * 修改URL查询参数
 * @param {Object} obj - 要修改的参数对象
 * @param {string} baseUrl - 基础URL
 * @returns {string} 修改后的URL
 */
function changeUrlQuery(obj, baseUrl) {
    console.log(`[小秋音乐] 修改URL查询参数: obj=${JSON.stringify(obj)}, baseUrl=${baseUrl}`);
    const query = getQueryFromUrl(null, baseUrl);
    let url = baseUrl.split("?")[0];
    const newQuery = Object.assign(Object.assign({}, query), obj);
    let queryArr = [];
    Object.keys(newQuery).forEach((key) => {
        if (newQuery[key] !== undefined && newQuery[key] !== "") {
            console.log(`[小秋音乐] 设置URL参数: ${key}=${newQuery[key]}`);
            queryArr.push(`${key}=${encodeURIComponent(newQuery[key])}`);
        }
    });
    const result = `${url}?${queryArr.join("&")}`.replace(/\?$/, "");
    console.log(`[小秋音乐] 修改URL查询参数完成: 结果=${result}`);
    return result;
}
const typeMap = {
    m4a: {
        s: "C400",
        e: ".m4a",
    },
    128: {
        s: "M500",
        e: ".mp3",
    },
    320: {
        s: "M800",
        e: ".mp3",
    },
    ape: {
        s: "A000",
        e: ".ape",
    },
    flac: {
        s: "F000",
        e: ".flac",
    },
};
/**
 * 获取专辑详情信息
 * @param {Object} albumItem - 专辑项目对象，包含albumMID等信息
 * @returns {Promise<Object>} 包含专辑内歌曲列表的对象
 */
async function getAlbumInfo(albumItem) {
    console.log(`[小秋音乐] 获取专辑详情: 专辑ID=${albumItem.id}, 专辑名称=${albumItem.title}`);
    
    try {
        // 构建请求URL
        const url = changeUrlQuery({
            data: JSON.stringify({
                comm: {
                    ct: 24,
                    cv: 10000,
                },
                albumSonglist: {
                    method: "GetAlbumSongList",
                    param: {
                        albumMid: albumItem.albumMID,
                        albumID: 0,
                        begin: 0,
                        num: 999,  // 获取专辑内所有歌曲
                        order: 2,  // 按歌曲序号排序
                    },
                    module: "music.musichallAlbum.AlbumSongList",
                },
            }),
        }, "https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8");
        
        console.log(`[小秋音乐] 发送专辑详情请求: URL=${url}`);
        const res = (await (0, axios_1.default)({
            url: url,
            headers: headers,
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 格式化专辑内歌曲列表
        const musicList = res.albumSonglist.data.songList
            .map((item) => {
                const _ = item.songInfo;
                return formatMusicItem(_);
            });
        
        console.log(`[小秋音乐] 获取专辑详情完成: 专辑${albumItem.title}，共包含${musicList.length}首歌曲`);
        return {
            musicList: musicList
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取专辑详情出错: 专辑ID=${albumItem.id}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取歌手歌曲列表
 * @param {Object} artistItem - 歌手项目对象，包含singerMID等信息
 * @param {number} page - 页码
 * @returns {Promise<Object>} 包含歌曲列表和是否结束的对象
 */
async function getArtistSongs(artistItem, page) {
    console.log(`[小秋音乐] 获取歌手歌曲列表: 歌手=${artistItem.name}, 页码=${page}`);
    try {
        // 构建请求URL
        const url = changeUrlQuery({
            data: JSON.stringify({
                comm: {
                    ct: 24,
                    cv: 0,
                },
                singer: {
                    method: "get_singer_detail_info",
                    param: {
                        sort: 5,  // 按热门排序
                        singermid: artistItem.singerMID,
                        sin: (page - 1) * pageSize,  // 计算起始位置
                        num: pageSize,  // 每页数量
                    },
                    module: "music.web_singer_info_svr",
                },
            }),
        }, "http://u.y.qq.com/cgi-bin/musicu.fcg");
        
        console.log(`[小秋音乐] 发送歌手歌曲列表请求: URL=${url}`);
        const res = (await (0, axios_1.default)({
            url: url,
            method: "get",
            headers: headers,
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 格式化歌手歌曲列表
        const data = res.singer.data.songlist.map(formatMusicItem);
        const isEnd = res.singer.data.total_song <= page * pageSize;
        
        console.log(`[小秋音乐] 获取歌手歌曲列表完成: 歌手${artistItem.name}，第${page}页，获取了${data.length}首歌曲，是否结束=${isEnd}`);
        return {
            isEnd: isEnd,
            data: data,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取歌手歌曲列表出错: 歌手=${artistItem.name}, 页码=${page}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取歌手专辑列表
 * @param {Object} artistItem - 歌手项目对象，包含singerMID等信息
 * @param {number} page - 页码
 * @returns {Promise<Object>} 包含专辑列表和是否结束的对象
 */
async function getArtistAlbums(artistItem, page) {
    console.log(`[小秋音乐] 获取歌手专辑列表: 歌手=${artistItem.name}, 页码=${page}`);
    try {
        // 构建请求URL
        const url = changeUrlQuery({
            data: JSON.stringify({
                comm: {
                    ct: 24,
                    cv: 0,
                },
                singerAlbum: {
                    method: "get_singer_album",
                    param: {
                        singermid: artistItem.singerMID,
                        order: "time",
                        begin: (page - 1) * pageSize,
                        num: pageSize / 1,
                        exstatus: 1,
                    },
                    module: "music.web_singer_info_svr",
                },
            }),
        }, "http://u.y.qq.com/cgi-bin/musicu.fcg");
        
        console.log(`[小秋音乐] 发送歌手专辑列表请求: URL=${url}`);
        const res = (await (0, axios_1.default)({
            url,
            method: "get",
            headers: headers,
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 格式化专辑数据
        const data = res.singerAlbum.data.list.map(formatAlbumItem);
        const isEnd = res.singerAlbum.data.total <= page * pageSize;
        
        console.log(`[小秋音乐] 获取歌手专辑列表完成: 歌手${artistItem.name}，第${page}页，获取了${data.length}张专辑，是否结束=${isEnd}`);
        return {
            isEnd: isEnd,
            data: data,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取歌手专辑列表出错: 歌手=${artistItem.name}, 页码=${page}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取歌手作品
 * @param {Object} artistItem - 歌手项目对象
 * @param {number} page - 页码
 * @param {string} type - 作品类型 (music/album)
 * @returns {Promise<Object>} 包含作品列表和是否结束的对象
 */
async function getArtistWorks(artistItem, page, type) {
    console.log(`[小秋音乐] 获取歌手作品: 歌手=${artistItem.name}, 页码=${page}, 类型=${type}`);
    try {
        let result;
        
        // 根据类型分发到不同的处理函数
        if (type === "music") {
            console.log(`[小秋音乐] 获取歌手歌曲作品: 歌手=${artistItem.name}`);
            result = await getArtistSongs(artistItem, page);
        } else {
            console.log(`[小秋音乐] 获取歌手专辑作品: 歌手=${artistItem.name}`);
            result = await getArtistAlbums(artistItem, page);
        }
        
        console.log(`[小秋音乐] 获取歌手作品完成: 歌手=${artistItem.name}, 类型=${type}`);
        return result;
    } catch (error) {
        console.error(`[小秋音乐] 获取歌手作品出错: 歌手=${artistItem.name}, 类型=${type}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取歌曲歌词
 * @param {Object} musicItem - 音乐项目对象，包含songmid等信息
 * @returns {Promise<Object>} 包含原始歌词和翻译歌词的对象
 */
async function getLyric(musicItem) {
    console.log(`[小秋音乐] 获取歌词: 歌曲=${musicItem.title || '未知'} - ${musicItem.artist || '未知'}, 歌曲ID=${musicItem.id}, songmid=${musicItem.songmid}`);
    try {
        // 构建请求URL
        const url = `http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${musicItem.songmid}&pcachetime=${new Date().getTime()}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`;
        
        console.log(`[小秋音乐] 发送歌词请求: URL=${url}`);
        const result = (await (0, axios_1.default)({
            url: url,
            headers: { Referer: "https://y.qq.com", Cookie: "uin=" },
            method: "get",
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 解析歌词数据
        const res = JSON.parse(result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ""));
        
        // 解析翻译歌词（如果有）
        let translation;
        if (res.trans) {
            translation = he.decode(CryptoJs.enc.Base64.parse(res.trans).toString(CryptoJs.enc.Utf8));
            console.log(`[小秋音乐] 成功解析翻译歌词: 长度=${translation.length}`);
        }
        
        // 解码原始歌词
        const rawLrc = he.decode(CryptoJs.enc.Base64.parse(res.lyric).toString(CryptoJs.enc.Utf8));
        
        console.log(`[小秋音乐] 获取歌词完成: 歌曲=${musicItem.title || '未知'}, 歌词长度=${rawLrc.length}${translation ? ', 有翻译歌词' : ''}`);
        return {
            rawLrc: rawLrc,
            translation,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取歌词出错: 歌曲=${musicItem.title || '未知'}, 错误=${error.message}`);
        // 出错时返回空歌词，避免程序崩溃
        return {
            rawLrc: "",
            translation: ""
        };
    }
}
/**
 * 导入音乐歌单
 * @param {string|number} urlLike - 歌单URL或歌单ID
 * @returns {Promise<Array>} 歌单中的歌曲列表
 */
async function importMusicSheet(urlLike) {
    console.log(`[小秋音乐] 导入音乐歌单: ${urlLike}`);
    try {
        let id;
        
        // 尝试从不同格式的URL中解析歌单ID
        if (!id) {
            console.log(`[小秋音乐] 尝试从分享链接解析歌单ID`);
            id = (urlLike.match(/https?:\/\/i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html\?.*id=([0-9]+)/) || [])[1];
        }
        
        if (!id) {
            console.log(`[小秋音乐] 尝试从歌单页面链接解析歌单ID`);
            id = (urlLike.match(/https?:\/\/y\.qq\.com\/n\/ryqq\/playlist\/([0-9]+)/) || [])[1];
        }
        
        if (!id) {
            console.log(`[小秋音乐] 尝试直接解析纯数字歌单ID`);
            id = (urlLike.match(/^(\d+)$/) || [])[1];
        }
        
        if (!id) {
            console.log(`[小秋音乐] 无法解析歌单ID`);
            return;
        }
        
        console.log(`[小秋音乐] 解析得到歌单ID: ${id}`);
        
        // 发送请求获取歌单详情
        console.log(`[小秋音乐] 发送歌单详情请求`);
        const result = (await (0, axios_1.default)({
            url: `http://i.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&utf8=1&disstid=${id}&loginUin=0`,
            headers: { Referer: "https://y.qq.com/n/yqq/playlist", Cookie: "uin=" },
            method: "get",
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        })).data;
        
        // 解析返回的歌单数据
        const res = JSON.parse(result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ""));
        
        // 格式化歌单中的歌曲列表
        const musicList = res.cdlist[0].songlist.map(formatMusicItem);
        
        console.log(`[小秋音乐] 导入歌单完成: ID=${id}, 共导入${musicList.length}首歌曲`);
        return musicList;
    } catch (error) {
        console.error(`[小秋音乐] 导入歌单出错: ${urlLike}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取QQ音乐排行榜列表
 * @returns {Promise<Array>} 排行榜分组列表
 */
async function getTopLists() {
    console.log(`[小秋音乐] 获取排行榜列表`);
    try {
        const list = await (0, axios_1.default)({
            url: "https://u.y.qq.com/cgi-bin/musicu.fcg?_=1577086820633&data=%7B%22comm%22%3A%7B%22g_tk%22%3A5381%2C%22uin%22%3A123456%2C%22format%22%3A%22json%22%2C%22inCharset%22%3A%22utf-8%22%2C%22outCharset%22%3A%22utf-8%22%2C%22notice%22%3A0%2C%22platform%22%3A%22h5%22%2C%22needNewCode%22%3A1%2C%22ct%22%3A23%2C%22cv%22%3A0%7D%2C%22topList%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetAll%22%2C%22param%22%3A%7B%7D%7D%7D",
            method: "get",
            headers: {
                Cookie: "uin=",
            },
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        });
        
        console.log(`[小秋音乐] 获取排行榜列表成功，开始格式化数据`);
        const result = list.data.topList.data.group.map((e) => ({
            title: e.groupName,
            data: e.toplist.map((_) => ({
                id: _.topId,
                description: _.intro,
                title: _.title,
                period: _.period,
                coverImg: _.headPicUrl || _.frontPicUrl,
            })),
        }));
        
        console.log(`[小秋音乐] 获取排行榜列表完成: 共${result.length}个排行榜分组`);
        return result;
    } catch (error) {
        console.error(`[小秋音乐] 获取排行榜列表出错: 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取排行榜详情
 * @param {Object} topListItem - 排行榜项目对象，包含id等信息
 * @returns {Promise<Object>} 包含排行榜内歌曲列表的对象
 */
async function getTopListDetail(topListItem) {
    console.log(`[小秋音乐] 获取排行榜详情: 排行榜=${topListItem.title}, ID=${topListItem.id}`);
    try {
        var _a;
        const res = await (0, axios_1.default)({
            url: `https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&data=%7B%22detail%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetDetail%22%2C%22param%22%3A%7B%22topId%22%3A${topListItem.id}%2C%22offset%22%3A0%2C%22num%22%3A100%2C%22period%22%3A%22${(_a = topListItem.period) !== null && _a !== void 0 ? _a : ""}%22%7D%7D%2C%22comm%22%3A%7B%22ct%22%3A24%2C%22cv%22%3A0%7D%7D`,
            method: "get",
            headers: {
                Cookie: "uin=",
            },
            xsrfCookieName: "XSRF-TOKEN",
            withCredentials: true,
        });
        
        // 格式化排行榜内歌曲列表
        const musicList = res.data.detail.data.songInfoList.map(formatMusicItem);
        
        console.log(`[小秋音乐] 获取排行榜详情完成: ${topListItem.title}，共包含${musicList.length}首歌曲`);
        return Object.assign(Object.assign({}, topListItem), {
            musicList: musicList
        });
    } catch (error) {
        console.error(`[小秋音乐] 获取排行榜详情出错: 排行榜=${topListItem.title}, ID=${topListItem.id}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取推荐歌单标签
 * @returns {Promise<Object>} 包含固定标签和分类标签的对象
 */
async function getRecommendSheetTags() {
    console.log(`[小秋音乐] 获取推荐歌单标签`);
    try {
        const res = (await axios_1.default.get("https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg?format=json&inCharset=utf8&outCharset=utf-8", {
            headers: {
                referer: "https://y.qq.com/",
            },
        })).data.data.categories;
        
        console.log(`[小秋音乐] 成功获取歌单标签数据，开始格式化`);
        const data = res.slice(1).map((_) => ({
            title: _.categoryGroupName,
            data: _.items.map((tag) => ({
                id: tag.categoryId,
                title: tag.categoryName,
            })),
        }));
        
        // 提取每个分类的第一个标签作为固定标签
        const pinned = [];
        for (let d of data) {
            if (d.data.length) {
                pinned.push(d.data[0]);
            }
        }
        
        console.log(`[小秋音乐] 获取推荐歌单标签完成: 固定标签${pinned.length}个, 分类标签${data.length}组`);
        return {
            pinned,
            data,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取推荐歌单标签出错: 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取指定标签下的推荐歌单
 * @param {Object|string} tag - 标签对象或标签名称
 * @param {number} page - 页码
 * @returns {Promise<Object>} 包含歌单列表和是否结束标记的对象
 */
async function getRecommendSheetsByTag(tag, page) {
    console.log(`[小秋音乐] 获取推荐歌单: 标签=${tag?.name || tag}, 页码=${page}`);
    try {
        const pageSize = 20;
        console.log(`[小秋音乐] 发送歌单请求: URL=https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg`);
        const rawRes = (await axios_1.default.get("https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg", {
            headers: {
                referer: "https://y.qq.com/",
            },
            params: {
                inCharset: "utf8",
                outCharset: "utf-8",
                sortId: 5,
                categoryId: (tag === null || tag === void 0 ? void 0 : tag.id) || "10000000",
                sin: pageSize * (page - 1),
                ein: page * pageSize - 1,
            },
        })).data;
        
        // 解析返回的歌单数据
        const res = JSON.parse(rawRes.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, "")).data;
        const isEnd = res.sum <= page * pageSize;
        
        // 格式化歌单数据
        const data = res.list.map((item) => {
            var _a, _b;
            return ({
                id: item.dissid,
                createTime: item.createTime,
                title: item.dissname,
                artwork: item.imgurl,
                description: item.introduction,
                playCount: item.listennum,
                artist: (_b = (_a = item.creator) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "",
            });
        });
        
        console.log(`[小秋音乐] 获取推荐歌单完成: 标签=${tag?.name || tag}, 当前页${data.length}条, 总数量${res.sum}条, ${isEnd ? "已到底" : "有更多"}`);
        return {
            isEnd,
            data,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取推荐歌单出错: 标签=${tag?.name || tag}, 页码=${page}, 错误=${error.message}`);
        throw error;
    }
}
/**
 * 获取歌单详情信息
 * @param {Object} sheet - 歌单对象，包含id等基本信息
 * @param {number} page - 页码，从0开始
 * @returns {Promise<Object>} 包含歌单信息、歌曲列表和是否结束标记的对象
 */
async function getMusicSheetInfo(sheet, page) {
    console.log(`[小秋音乐] 获取歌单详情: 歌单ID=${sheet.id}, 页码=${page + 1}`);
    try {
        // 构建请求URL
        const url = changeUrlQuery({
            disstid: sheet.id,
            format: "json",
            inCharset: "utf8",
            outCharset: "utf-8",
            notice: 0,
            platform: "h5",
            needNewCode: 1,
            _: Date.now(),
        }, "https://u.y.qq.com/cgi-bin/musicu.fcg");
        
        // 构建请求体
        const requestBody = {
            comm: {
                ct: 24,
                cv: 10000,
            },
            recomPlaylist: {
                method: "get_playlist_by_dissid",
                module: "music.playlist.PlayListInfoServer",
                param: {
                    dissid: sheet.id,
                    onlysong: 0,
                    song_begin: page * 30,  // 偏移量，每页30条
                    song_num: 30,  // 每页获取30条
                },
            },
        };
        
        console.log(`[小秋音乐] 发送歌单详情请求: URL=${url}`);
        const res = (await axios_1.default.post(url, requestBody, { headers })).data;
        
        // 获取歌曲列表数据
        const songInfoList = res.recomPlaylist.data.songlist;
        
        // 格式化歌曲列表
        const musicList = songInfoList.map((item) => formatMusicItem(item));
        
        // 判断是否为最后一页
        const isEnd = songInfoList.length < 30;
        
        // 构建歌单详细信息
        const sheetInfo = {
            id: sheet.id,
            title: res.recomPlaylist.data.dissname,
            artwork: `https://y.gtimg.cn/music/photo_new/T002R300x300M000${res.recomPlaylist.data.imgurl}.jpg`,
            description: res.recomPlaylist.data.desc,
            createTime: new Date(res.recomPlaylist.data.createtime * 1000).toLocaleDateString(),
            playCount: res.recomPlaylist.data.visitnum,
            songCount: res.recomPlaylist.data.songnum,
            artist: {
                name: res.recomPlaylist.data.creator.name,
                id: res.recomPlaylist.data.creator.uin,
            },
        };
        
        console.log(`[小秋音乐] 获取歌单详情完成: 歌单=${sheetInfo.title}, 当前页${musicList.length}首歌, 总数量${sheetInfo.songCount}首歌, ${isEnd ? "已到底" : "有更多"}`);
        return {
            isEnd: isEnd,
            musicList: musicList,
            sheetInfo: sheetInfo,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取歌单详情出错: 歌单ID=${sheet.id}, 页码=${page + 1}, 错误=${error.message}`);
        throw error;
    }
}
// 音乐质量级别映射表
const qualityLevels = {
    low: "128k",      // 低质量（128kbps）
    standard: "320k", // 标准质量（320kbps）
    high: "740",      // 高质量（740kbps）
    super: "999k",    // 超高音质（999kbps）
};

/**
 * 获取音乐媒体资源链接
 * @param {Object} musicItem - 音乐项目对象，包含songmid等信息
 * @param {string} quality - 音质级别，可选值：low, standard, high, super
 * @returns {Promise<Object>} 包含音乐URL的对象
 */
async function getMediaSource(musicItem, quality) {
    console.log(`[小秋音乐] 获取媒体资源: 歌曲=${musicItem.title}, 歌手=${musicItem.artist?.name}, 音质=${quality}`);
    try {
        // 构建请求URL，使用第三方API获取音乐链接
        const apiUrl = `https://music-api.gdstudio.xyz/api.php?types=url&source=tencent&id=${musicItem.songmid}&br=${qualityLevels[quality]}`;
        
        console.log(`[小秋音乐] 发送媒体资源请求: URL=${apiUrl}`);
        const res = (
            await axios_1.default.get(apiUrl, {
                headers: {
                    "X-Request-Key": "share-v2"
                },
            })
        ).data;
        
        console.log(`[小秋音乐] 获取媒体资源完成: 歌曲=${musicItem.title}, ${res.url ? '成功获取URL' : '获取URL失败'}`);
        return {
            url: res.url,
        };
    } catch (error) {
        console.error(`[小秋音乐] 获取媒体资源出错: 歌曲=${musicItem.title}, 错误=${error.message}`);
        throw error;
    }
}
module.exports = {
    platform: "小秋音乐",
    author: 'ikucao',
    version: "1.0.0",
    //srcUrl: "https://fastly.jsdelivr.net/gh/Huibq/keep-alive/Music_Free/xiaoqiu.js",
    cacheControl: "no-cache",
    hints: {
        importMusicSheet: [
            "QQ音乐APP：自建歌单-分享-分享到微信好友/QQ好友；然后点开并复制链接，直接粘贴即可",
            "H5：复制URL并粘贴，或者直接输入纯数字歌单ID即可",
            "导入时间和歌单大小有关，请耐心等待",
        ],
    },
    primaryKey: ["id", "songmid"],
    supportedSearchType: ["music", "album", "sheet", "artist", "lyric"],
    async search(query, page, type) {
        if (type === "music") {
            return await searchMusic(query, page);
        }
        if (type === "album") {
            return await searchAlbum(query, page);
        }
        if (type === "artist") {
            return await searchArtist(query, page);
        }
        if (type === "sheet") {
            return await searchMusicSheet(query, page);
        }
        if (type === "lyric") {
            return await searchLyric(query, page);
        }
    },
    getMediaSource,
    getLyric,
    getAlbumInfo,
    getArtistWorks,
    importMusicSheet,
    getTopLists,
    getTopListDetail,
    getRecommendSheetTags,
    getRecommendSheetsByTag,
    getMusicSheetInfo,
};