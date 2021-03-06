/**
 * 稍后再看
 * @description 思路：我们利用保存好了的数组，当用户点击稍后再看的观看按钮时，我们取出数组中的前几个（自定义数量）元素，打开标签页；打开完了之后，我们维护一个字典：{tabId:{url,{tabInfo}}} =>这里是所有打开了并没有被关闭或者转换了url的标签页信息，如果标签关闭了，或者被导航至其他url时，我们会将其从字典中删除，并将其对应的url从数组中删除。=>观看完毕。其中，我们还要保证其在点击了按钮之后，页面一直保持着打开（自定义）着一定数量的标签（除非数组中满足不了数量的要求）；直到清空数组所有元素。
 */

class WatchPlan {
    constructor() {
        this.OpFlag = true;
        this.execWatchReqTabNum = 3;
        this.tabStateDic = {};
        this.ori_list = {};
        this.livePageWatchTimeRecList = {};
        this.bananaTask = {};
    }

    onLoad() {
        console.log("Registered WatchPlan Mod.");
    }

    /**
     * 设置稍后再看需要保持在前台的标签任务数
     * @param {*} num 
     */
    setWatchOptTabNum(num) {
        this.execWatchReqTabNum = num;
    }

    /**
     * 获取状态信息
     */
    getOpRes() {
        return this.OpFlag;
    }

    ifExist(list, obj) {
        if (
            list.find(item => {
                return item == obj;
            })
        ) {
            return true
        } else {
            return false
        }
    }

    /**
     * 加入任务队列
     * @param {*} data 主站投稿的URL
     * @returns this.OpFlag 判断结果
     */
    async PushInList(data) {
        var sw = await getStorage("watchLater");
        if (!sw.watchLater) { this.OpFlag = false; return }
        var ori_list = await getStorage("WatchPlanList");
        //假如任务队列为空，则先构造一个列表
        if (ori_list.WatchPlanList == null) {
            chrome.storage.local.set({ WatchPlanList: [] });
            ori_list = await getStorage("WatchPlanList");
        }
        //假如传入数据（链接）为视频、文章、用户首页 并且 其不是先存在于任务队列中的数据 就假如队列，并修改操作状态信息为 是
        if ((REG.video.test(data) || REG.article.test(data) || REG.userHome.test(data)) && !this.ifExist(ori_list.WatchPlanList, data)) {
            ori_list.WatchPlanList.push(data)
            chrome.storage.local.set({ "WatchPlanList": ori_list.WatchPlanList });
            this.OpFlag = true
        } else {
            this.OpFlag = false
        }
    }

    /**
     * 打开标签，并返回一个tab Info字典
     * @param {*} url 
     * @returns tabInfo dict
     */
    async execTabCreate(url) {
        return new Promise((resolve, reject) => {
            chrome.tabs.create({ url: url }, (e) => {
                resolve(e);
            });
        });
    }

    /**
     * 稍后再看-核心
     * @description 打开-监听-任务队列维护
     */
    async execWatch() {
        //打开列表中的前面几项（默认3项），并监听他们的状态（onRemoved or onUpdated），状态改变之后就将其从列表中删除，并补上页面，保持页面数量在指定数量。
        this.ori_list = await getStorage("WatchPlanList");
        chrome.tabs.onRemoved.addListener((id) => {
            //在关闭某个标签，检查是否是我们维护的标签状态对象里面的对象
            if (this.tabStateDic.hasOwnProperty(id)) {
                delete this.tabStateDic[id];
            }
        })

        var _daemon = setInterval(async () => {
            //判断 标签状态对象 里面的维护对象数（此次稍后再看排程列表长）是否比需要保持的稍后再看的标签保持数小，并且稍后再看列表不为空
            if (Object.keys(this.tabStateDic).length < this.execWatchReqTabNum && this.ori_list.WatchPlanList.length != 0) {
                let info = await this.execTabCreate(this.ori_list.WatchPlanList.slice(-1)[0]);
                this.tabStateDic[info.id] = { url: info.pendingUrl, tabInfo: info };
                this.ori_list.WatchPlanList.pop(this.ori_list.WatchPlanList.slice(-1)[0]);
            }
            if (Object.keys(this.tabStateDic).length == 0 && this.ori_list.WatchPlanList.length == 0) {
                chrome.storage.local.set({ WatchPlanList: [] });
                chrome.notifications.create(null, {
                    type: 'basic',
                    iconUrl: 'images/notice.png',
                    title: 'AcFun 助手 - 稍后再看',
                    message: '已完成所有稍后再看列表项排程'
                });
                clearInterval(_daemon);
            }
        }, 2000);
        return;
    }

    // viewHistoryBackend(opts) {
    //     try {
    //         var x = JSON.parse(opts.msg).history.views;
    //     } catch (error) {
    //         console.log("[LOG]Backend-WatchPlan > viewHistoryBackend: viewHistory fetch Fail.");
    //         return
    //     }
    //     db_putHistoryViews(x)
    // }

    /**
     * 将直播观看起始信息写入类中
     * @param {*} params 
     */
    livePageWatchTimeRec(params) {
        this.livePageWatchTimeRecList[`${params.tabid.id}`] = { windowId: params.tabid.windowId, index: params.tabid.index, startTime: params.startTime, url: params.tabid.url, title: params.tabid.title };
    }

    /**
     * 获取直播观看时长计分板
     */
    getLiveWatchTimeList() {
        return this.livePageWatchTimeRecList;
    }

    /**
     * 清除直播观看时长计分板
     */
    cleanLiveWatchTimeList() {
        this.livePageWatchTimeRecList = {};
    }

    delLiveWatchTimeListItem(item) {
        delete this.livePageWatchTimeRecList[item];
    }

    /**
     * 更新直播观看时长计分板
     * @description 清除不存在的信息
     */
    async updateLiveWatchTimeList() {
        let lwList = Object.keys(this.livePageWatchTimeRecList)
        for (let i in lwList) {
            await chrome.tabs.query({ url: this.livePageWatchTimeRecList[lwList[i]].url }, (e) => {
                if (e.length < 1) {
                    delete this.livePageWatchTimeRecList[lwList[i]]
                }
            })
        }
        return true
    }

    async connectAcFunQmlByUrlScheme(url) {
        if (REG.videoAndBangumi.test || Reg.article.test) {
            console.log(url)
            let x = RegExp("/ac(.*)")
            let y = x.exec(url)
            if (y != null) {
                chrome.tabs.create({ url: "AcFunQml://" + y[1] }, (e) => { });
                var msg = "启动中"
            } else {
                var msg = "不是稿件"
            }
            chrome.notifications.create(null, {
                type: 'basic',
                iconUrl: 'images/notice.png',
                title: 'AcFun 助手',
                message: msg,
            });
        }
    }

    /**
     * 主站标签整理
     * @param {*} mainWindowId 主窗口ID
     */
    attentionTabs(mainWindowId) {
        let wId;
        mainWindowId ? wId = mainWindowId : wId = 1;
        chrome.tabs.getAllInWindow(wId, function (e) {
            //存储本窗口中是主站的标签的ID
            let x = [];
            let y = new RegExp("https://www.acfun.cn");
            let z = new RegExp("https://live.acfun.cn");
            for (let i = 0; i < e.length; i++) {
                if (y.exec(e[i].url) || z.exec(e[i].url)) {
                    x.push(e[i].id);
                }
            }
            if (x.length != 0) {
                notice("自动整理", `在整理了在整理了！！整理了${x.length}个标签。`);
            } else {
                notice("自动整理", `没有什么能整理的标签页好不好。`);
                return
            }
            //创建一个窗口并将主站相关的标签都移动至新窗口
            chrome.windows.create((f) => {
                for (let j = 0; j < x.length; j++) {
                    chrome.tabs.move(x[j], { windowId: f.id, index: 1 })
                }
            })
        })
    }

    /**
     * 渐进式投蕉的后端接收函数
     * @todo 很多事....
     * @param {*} action 
     * @param {*} url 
     */
    ProgressiveBananaRemote(action, url) {
        let x = new RegExp("/v/ac(.*)")
        let acId = x.exec(url)[1];
        switch (action) {
            case 0:
                var bananaNum = 1
                break;
            case 1:
                var bananaNum = 2
                break;
            case 2:
                var bananaNum = 3
                break;
            case 3:
                var bananaNum = 4
                break;
            case 4:
                var bananaNum = 5
                break;
            case 5:
                var bananaNum = 5
                break;
            case 'Heart':
                break;
        }
        this.bananaTask[`${String(acId)}`] = { acId, bananaNum };
        console.log(this.bananaTask)
        this.ProgressiveBananaBackendMain();
    }
    
    /**
     * 投蕉的后台实现，需要使用任务队列
     */
    ProgressiveBananaBackendMain() {
        let x = Object.keys(this.bananaTask);
        for (let i = 0; i < x.length; i++) {
            // bananaThrow(x[i],this.bananaTask[x[i]])
            console.log(this.bananaTask[x[i]]);
        }
        console.log("no thing")
    }

    xpGraph() {
        getAllAboutAc = () => {
            return new Promise((resolve, reject) => {
                chrome.history.search({ text: "AcFun" }, (e) => {
                    if (e.length != 0) {
                        resolve(e);
                    } else {
                        reject(null);
                    }
                });
            });
        }
        getSameUrlHist = (url) => {
            return new Promise((resolve, reject) => {
                chrome.history.getVisits({ url: url }, function (e) {
                    if (e.length != 0) {
                        resolve(e);
                    } else {
                        reject(null);
                    }
                })
            })
        }
    }

}