// demo-data.js — 公网演示（demo 模式）专用虚拟数据
// 数据结构与 mock.js 的 DB 完全一致，便于无缝替换。
// 重要：全部为虚构数据，不含任何真实个人信息（姓名/学号/手机号/快递/地址均为虚构）。

var DEMO_DATA = {
  user: {
    id: "DEMO001",
    name: "张同学",
    studentId: "2025000001",
    phone: "138****0000",
    campus: "演示校区 · 兰苑 5号楼",
    dormitory: "兰苑 5号楼",
    boundPhone: false,
    avatar: null,
    packageCount: 6,
    pickedCount: 6,
    unreadMessages: 3,
  },

  packages: [
    { id: "DEMOPK001", company: "顺丰速运", shortName: "SF", logoColor: "#1E40AF", trackingNo: "SF1357924680", pickupCode: "8-3-267", status: "pending", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 A区8号架", businessHours: "08:00 - 20:00", estimatedTime: "今日 18:00 前", lockerNo: null, type: "普通", size: "中", arrivedAt: "今天 10:30", expiresIn: "23小时", sender: "演示书店", remark: "" },
    { id: "DEMOPK002", company: "圆通速递", shortName: "YT", logoColor: "#7C3AED", trackingNo: "YT2468013579", pickupCode: "5-8-112", status: "pending", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 B区5号架", businessHours: "08:00 - 20:00", estimatedTime: "今日 18:00 前", lockerNo: null, type: "普通", size: "小", arrivedAt: "今天 09:15", expiresIn: "22小时", sender: "演示文具旗舰店", remark: "" },
    { id: "DEMOPK003", company: "中通快递", shortName: "ZT", logoColor: "#0EA5E9", trackingNo: "ZT9753186420", pickupCode: "9-2-345", status: "pending", pickupPoint: "智能快递柜（兰苑）", pickupAddress: "兰苑5号楼 一层大厅", businessHours: "24小时", estimatedTime: "随时可取", lockerNo: "9-2-345", type: "普通", size: "中", arrivedAt: "今天 08:20", expiresIn: "47小时", sender: "演示优品", remark: "已放入快递柜" },
    { id: "DEMOPK004", company: "韵达快递", shortName: "YD", logoColor: "#003DA5", trackingNo: "YD1122334455", pickupCode: "D-06-23", status: "pending", pickupPoint: "智能快递柜（菊苑）", pickupAddress: "菊苑2号楼 一层大厅", businessHours: "24小时", estimatedTime: "随时可取", lockerNo: "D-06-23", type: "大件", size: "大", arrivedAt: "昨天 16:40", expiresIn: "11小时", sender: "演示家居", remark: "大件包裹，建议手推车" },
    { id: "DEMOPK005", company: "京东物流", shortName: "JD", logoColor: "#DC2626", trackingNo: "JD9988776655", pickupCode: "8-3-301", status: "pending", pickupPoint: "菜鸟驿站（南门）", pickupAddress: "南门驿站 A区3号架", businessHours: "08:00 - 22:00", estimatedTime: "今日 22:00 前", lockerNo: null, type: "冷链", size: "中", arrivedAt: "今天 11:00", expiresIn: "25小时", sender: "演示生鲜", remark: "冷链包裹请尽快取" },
    { id: "DEMOPK006", company: "极兔速递", shortName: "JT", logoColor: "#F97316", trackingNo: "JT5566778899", pickupCode: "8-3-355", status: "pending", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 A区8号架", businessHours: "08:00 - 20:00", estimatedTime: "今日 20:00 前", lockerNo: null, type: "普通", size: "小", arrivedAt: "今天 07:45", expiresIn: "21小时", sender: "演示百货", remark: "" },
    { id: "DEMOPK007", company: "申通快递", shortName: "ST", logoColor: "#0891B2", trackingNo: "ST6677889900", pickupCode: "", status: "incoming", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站", businessHours: "08:00 - 20:00", estimatedTime: "预计今日 15:00 到达", lockerNo: null, type: "普通", size: "小", arrivedAt: null, expiresIn: null, sender: "演示商城", remark: "运输中，已到分拣中心" },
    { id: "DEMOPK008", company: "邮政EMS", shortName: "EMS", logoColor: "#059669", trackingNo: "EM1234567890", pickupCode: "", status: "incoming", pickupPoint: "菜鸟驿站（南门）", pickupAddress: "南门驿站", businessHours: "08:00 - 22:00", estimatedTime: "预计明日 10:00 到达", lockerNo: null, type: "文件", size: "小", arrivedAt: null, expiresIn: null, sender: "演示教务处", remark: "运输中" },
    { id: "DEMOPK009", company: "顺丰速运", shortName: "SF", logoColor: "#1E40AF", trackingNo: "SF2468135790", pickupCode: "", status: "incoming", pickupPoint: "菜鸟驿站（南门）", pickupAddress: "南门驿站", businessHours: "08:00 - 22:00", estimatedTime: "预计今日 17:00 到达", lockerNo: null, type: "冷链", size: "中", arrivedAt: null, expiresIn: null, sender: "演示果园", remark: "冷链运输中" },
    { id: "DEMOPK010", company: "中通快递", shortName: "ZT", logoColor: "#0EA5E9", trackingNo: "ZT1029384756", pickupCode: "3-1-089", status: "picked", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 B区3号架", businessHours: "08:00 - 20:00", estimatedTime: "已取件", lockerNo: null, type: "普通", size: "小", arrivedAt: "昨天 14:20", expiresIn: null, sender: "演示服饰店", remark: "", pickedAt: "昨天 16:30" },
    { id: "DEMOPK011", company: "圆通速递", shortName: "YT", logoColor: "#7C3AED", trackingNo: "YT5647382910", pickupCode: "C-15-67", status: "picked", pickupPoint: "智能快递柜（兰苑）", pickupAddress: "兰苑5号楼 一层大厅", businessHours: "24小时", estimatedTime: "已取件", lockerNo: "C-15-67", type: "普通", size: "小", arrivedAt: "09-12 09:30", expiresIn: null, sender: "演示潮玩", remark: "", pickedAt: "09-12 10:00" },
    { id: "DEMOPK012", company: "京东物流", shortName: "JD", logoColor: "#DC2626", trackingNo: "JD6677881122", pickupCode: "D-08-12", status: "picked", pickupPoint: "智能快递柜（菊苑）", pickupAddress: "菊苑2号楼 一层大厅", businessHours: "24小时", estimatedTime: "已取件", lockerNo: "D-08-12", type: "普通", size: "大", arrivedAt: "09-11 15:00", expiresIn: null, sender: "演示自营", remark: "", pickedAt: "09-11 18:20" },
    { id: "DEMOPK013", company: "韵达快递", shortName: "YD", logoColor: "#003DA5", trackingNo: "YD8877665544", pickupCode: "3-1-201", status: "picked", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 B区3号架", businessHours: "08:00 - 20:00", estimatedTime: "已取件", lockerNo: null, type: "普通", size: "小", arrivedAt: "09-10 13:00", expiresIn: null, sender: "演示数码", remark: "", pickedAt: "09-10 14:30" },
    { id: "DEMOPK014", company: "极兔速递", shortName: "JT", logoColor: "#F97316", trackingNo: "JT3344556677", pickupCode: "8-3-098", status: "picked", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 A区8号架", businessHours: "08:00 - 20:00", estimatedTime: "已取件", lockerNo: null, type: "普通", size: "中", arrivedAt: "09-08 11:00", expiresIn: null, sender: "演示好物", remark: "", pickedAt: "09-08 12:15" },
    { id: "DEMOPK015", company: "申通快递", shortName: "ST", logoColor: "#0891B2", trackingNo: "ST1122334455", pickupCode: "C-10-23", status: "expired", pickupPoint: "菜鸟驿站（楷苑）", pickupAddress: "楷苑驿站 A区8号架", businessHours: "08:00 - 20:00", estimatedTime: "已逾期", lockerNo: null, type: "普通", size: "中", arrivedAt: "09-05 11:00", expiresIn: null, sender: "演示超市", remark: "已退回发件人", pickedAt: null },
  ],

  pickupPoints: [
    { id: "PP01", name: "菜鸟驿站（楷苑）", type: "station", address: "楷苑南侧一层", distance: "120m", walkTime: "2分钟", businessHours: "08:00 - 20:00", x: 60.5, y: 33.5, pendingCount: 4, color: "#2563EB" },
    { id: "PP02", name: "菜鸟驿站（南门）", type: "station", address: "南门入口广场东侧", distance: "650m", walkTime: "8分钟", businessHours: "08:00 - 22:00", x: 58, y: 91.5, pendingCount: 1, color: "#2563EB" },
    { id: "PP03", name: "智能快递柜（兰苑）", type: "locker", address: "兰苑5号楼一层", distance: "250m", walkTime: "3分钟", businessHours: "24小时", x: 47, y: 24, pendingCount: 1, color: "#10B981" },
    { id: "PP04", name: "智能快递柜（菊苑）", type: "locker", address: "菊苑2号楼一层", distance: "400m", walkTime: "5分钟", businessHours: "24小时", x: 29.5, y: 19.5, pendingCount: 1, color: "#10B981" },
    { id: "PP05", name: "京东快递（梅苑）", type: "station", address: "梅苑1号楼一层", distance: "350m", walkTime: "4分钟", businessHours: "09:00 - 21:00", x: 69.5, y: 13, pendingCount: 0, color: "#DC2626" },
    { id: "PP06", name: "顺丰速运（信息楼）", type: "station", address: "信息楼一层大厅", distance: "500m", walkTime: "6分钟", businessHours: "09:00 - 18:00", x: 74.5, y: 61, pendingCount: 0, color: "#1E40AF" },
  ],

  records: [
    { id: "R001", packageId: "DEMOPK010", company: "中通快递", shortName: "ZT", logoColor: "#0EA5E9", trackingNo: "ZT1029384756", pickedAt: "昨天 16:30", pickupPoint: "菜鸟驿站（楷苑）", pickupCode: "3-1-089", type: "普通" },
    { id: "R002", packageId: "DEMOPK011", company: "圆通速递", shortName: "YT", logoColor: "#7C3AED", trackingNo: "YT5647382910", pickedAt: "09-12 10:00", pickupPoint: "智能快递柜（兰苑）", pickupCode: "C-15-67", type: "普通" },
    { id: "R003", packageId: "DEMOPK012", company: "京东物流", shortName: "JD", logoColor: "#DC2626", trackingNo: "JD6677881122", pickedAt: "09-11 18:20", pickupPoint: "智能快递柜（菊苑）", pickupCode: "D-08-12", type: "大件" },
    { id: "R004", packageId: "DEMOPK013", company: "韵达快递", shortName: "YD", logoColor: "#003DA5", trackingNo: "YD8877665544", pickedAt: "09-10 14:30", pickupPoint: "菜鸟驿站（楷苑）", pickupCode: "3-1-201", type: "普通" },
    { id: "R005", packageId: "DEMOPK014", company: "极兔速递", shortName: "JT", logoColor: "#F97316", trackingNo: "JT3344556677", pickedAt: "09-08 12:15", pickupPoint: "菜鸟驿站（楷苑）", pickupCode: "8-3-098", type: "普通" },
    { id: "R006", packageId: "DEMOPK016", company: "顺丰速运", shortName: "SF", logoColor: "#1E40AF", trackingNo: "SF7788991122", pickedAt: "09-06 11:00", pickupPoint: "菜鸟驿站（楷苑）", pickupCode: "8-3-100", type: "普通" },
  ],

  messages: [
    { id: "M01", type: "pickup", title: "快递到达提醒", content: "您的【顺丰速运】演示包裹已到达菜鸟驿站（楷苑），取件码 8-3-267，请在23小时内取件。", time: "10分钟前", read: false, icon: "package", color: "#2563EB" },
    { id: "M02", type: "pickup", title: "快递到达提醒", content: "您的【圆通速递】演示包裹已放入智能快递柜（兰苑），取件码 5-8-112，24小时随时可取。", time: "1小时前", read: false, icon: "package", color: "#2563EB" },
    { id: "M03", type: "warning", title: "取件即将逾期", content: "您的【韵达快递】演示大件包裹将在11小时后逾期，请尽快前往智能快递柜（菊苑）取件。", time: "3小时前", read: false, icon: "alert", color: "#F59E0B" },
    { id: "M04", type: "pickup", title: "取件成功", content: "您已成功取走【中通快递】演示包裹 ZT1029384756，感谢使用校园快递服务。", time: "昨天 16:30", read: true, icon: "check", color: "#10B981" },
    { id: "M05", type: "system", title: "系统通知", content: "欢迎使用校园智能生活 App 演示版，当前所有数据均为虚拟演示数据。", time: "昨天 10:00", read: true, icon: "bell", color: "#64748B" },
    { id: "M06", type: "system", title: "营业时间变更", content: "菜鸟驿站（楷苑）自本月起营业时间调整为 08:00 - 21:00，请留意。", time: "09-10 08:00", read: true, icon: "bell", color: "#64748B" },
  ],

  favoritePoints: [
    { id: "PP01", name: "菜鸟驿站（楷苑）", address: "楷苑驿站", distance: "120m" },
    { id: "PP03", name: "智能快递柜（兰苑）", address: "兰苑5号楼一层", distance: "50m" },
    { id: "PP02", name: "菜鸟驿站（南门）", address: "南门驿站", distance: "350m" },
  ],

  packageTypes: [
    { key: "all", label: "全部" },
    { key: "pending", label: "待取件" },
    { key: "incoming", label: "运输中" },
    { key: "picked", label: "已取件" },
    { key: "expired", label: "已逾期" },
  ],

  foodCategories: [
    { key: "all", label: "全部" },
    { key: "breakfast", label: "早餐" },
    { key: "fastfood", label: "快餐" },
    { key: "tea", label: "奶茶" },
    { key: "snack", label: "小吃" },
    { key: "fruit", label: "水果" },
    { key: "night", label: "夜宵" },
  ],

  // 演示外卖店铺（坐标与 3D 地图一致）
  restaurants: [
    { id: "F01", name: "校园一食堂", category: "fastfood", emoji: "🍛", color: "#F59E0B", rating: 4.8, monthlySales: 1280, deliveryTime: 20, deliveryFee: 0, minOrder: 0, promo: { full: 20, cut: 3 }, tags: ["满20减3", "免配送费"], notice: "食堂直供 · 现做现送", x: 40, y: 33, accessNode: "c3" },
    { id: "F02", name: "张记包子铺", category: "breakfast", emoji: "🥟", color: "#EA580C", rating: 4.7, monthlySales: 860, deliveryTime: 15, deliveryFee: 0, minOrder: 6, promo: { full: 15, cut: 2 }, tags: ["满15减2", "免费配送"], notice: "凌晨现包 · 豆浆免费续", x: 20.5, y: 15.5, accessNode: "d1" },
    { id: "F03", name: "麦当劳", category: "fastfood", emoji: "🍔", color: "#DC2626", rating: 4.7, monthlySales: 980, deliveryTime: 30, deliveryFee: 2, minOrder: 10, promo: { full: 39, cut: 8 }, tags: ["满39减8"], notice: "巨无霸周一买一送一", x: 80, y: 55, accessNode: "e2" },
    { id: "F04", name: "蜜雪冰城", category: "tea", emoji: "🥤", color: "#EC4899", rating: 4.9, monthlySales: 2350, deliveryTime: 25, deliveryFee: 1, minOrder: 5, promo: { full: 20, cut: 4 }, tags: ["满20减4", "新客立减2"], notice: "冰鲜柠檬水 4 元起", x: 52, y: 90, accessNode: "p1" },
    { id: "F05", name: "沙县小吃", category: "snack", emoji: "🍜", color: "#F97316", rating: 4.6, monthlySales: 1560, deliveryTime: 15, deliveryFee: 0, minOrder: 8, promo: { full: 15, cut: 2 }, tags: ["满15减2", "配送免单"], notice: "拌面 + 炖罐套餐 12 元", x: 38.5, y: 15.5, accessNode: "d1" },
    { id: "F06", name: "果鲜森水果店", category: "fruit", emoji: "🍓", color: "#10B981", rating: 4.8, monthlySales: 720, deliveryTime: 35, deliveryFee: 1, minOrder: 15, promo: { full: 25, cut: 5 }, tags: ["满25减5"], notice: "当日鲜切 · 冷链配送", x: 38.5, y: 27, accessNode: "d1" },
    { id: "F07", name: "深夜食堂烧烤", category: "night", emoji: "🍢", color: "#8B5CF6", rating: 4.5, monthlySales: 640, deliveryTime: 40, deliveryFee: 2, minOrder: 20, promo: { full: 40, cut: 8 }, tags: ["满40减8", "夜宵免配送费"], notice: "营业至凌晨 1:00", x: 60.5, y: 29, accessNode: "d1" },
  ],

  foods: [
    { id: "F01-01", restaurantId: "F01", name: "红烧肉套餐", price: 15, sales: 560, emoji: "🍖", desc: "两荤一素，含米饭例汤" },
    { id: "F01-02", restaurantId: "F01", name: "番茄鸡蛋盖饭", price: 12, sales: 430, emoji: "🍅", desc: "食堂招牌，酸甜下饭" },
    { id: "F01-03", restaurantId: "F01", name: "牛肉拉面", price: 14, sales: 380, emoji: "🍜", desc: "现拉现煮，汤浓面筋" },
    { id: "F01-04", restaurantId: "F01", name: "小炒黄牛肉", price: 18, sales: 210, emoji: "🥘", desc: "湘味小炒，微辣" },
    { id: "F01-05", restaurantId: "F01", name: "紫菜蛋花汤", price: 3, sales: 300, emoji: "🍲", desc: "餐前一碗，暖胃" },
    { id: "F01-06", restaurantId: "F01", name: "白米饭", price: 1, sales: 1200, emoji: "🍚", desc: "东北五常大米" },
    { id: "F02-01", restaurantId: "F02", name: "鲜肉大包（2个）", price: 5, sales: 720, emoji: "🥟", desc: "发面蓬松，肉馅饱满" },
    { id: "F02-02", restaurantId: "F02", name: "豆浆", price: 3, sales: 640, emoji: "🥛", desc: "现磨无糖/微糖" },
    { id: "F02-03", restaurantId: "F02", name: "油条", price: 2, sales: 520, emoji: "🥖", desc: "现炸酥脆" },
    { id: "F02-04", restaurantId: "F02", name: "茶叶蛋", price: 2.5, sales: 480, emoji: "🥚", desc: "入味五香味" },
    { id: "F02-05", restaurantId: "F02", name: "小米粥", price: 3, sales: 300, emoji: "🥣", desc: "慢熬两小时" },
    { id: "F03-01", restaurantId: "F03", name: "巨无霸套餐", price: 39.9, sales: 320, emoji: "🍔", desc: "巨无霸+薯条+可乐" },
    { id: "F03-02", restaurantId: "F03", name: "麦辣鸡腿堡", price: 22, sales: 280, emoji: "🍔", desc: "香辣鸡腿，经典单品" },
    { id: "F03-03", restaurantId: "F03", name: "麦香鱼", price: 19, sales: 120, emoji: "🐟", desc: "深海鳕鱼堡" },
    { id: "F03-04", restaurantId: "F03", name: "薯条（大）", price: 13, sales: 400, emoji: "🍟", desc: "金黄酥脆" },
    { id: "F03-05", restaurantId: "F03", name: "麦乐鸡（5块）", price: 14, sales: 260, emoji: "🍗", desc: "配蒜蓉辣酱" },
    { id: "F03-06", restaurantId: "F03", name: "圆筒冰淇淋", price: 5, sales: 380, emoji: "🍦", desc: "香草味，随单配送" },
    { id: "F04-01", restaurantId: "F04", name: "冰鲜柠檬水", price: 4, sales: 1890, emoji: "🍋", desc: "现场手打，鲜切柠檬" },
    { id: "F04-02", restaurantId: "F04", name: "珍珠奶茶", price: 6, sales: 1450, emoji: "🧋", desc: "经典奶茶配黑糖珍珠" },
    { id: "F04-03", restaurantId: "F04", name: "蜜桃四季春", price: 8, sales: 980, emoji: "🍑", desc: "桃香乌龙，清爽不腻" },
    { id: "F04-04", restaurantId: "F04", name: "冰淇淋圣代", price: 5, sales: 760, emoji: "🍨", desc: "巧克力脆筒" },
    { id: "F04-05", restaurantId: "F04", name: "椰果奶绿", price: 7, sales: 520, emoji: "🥥", desc: "茉莉绿茶+椰果" },
    { id: "F05-01", restaurantId: "F05", name: "飘香拌面", price: 7, sales: 860, emoji: "🍜", desc: "花生酱+葱油拌制" },
    { id: "F05-02", restaurantId: "F05", name: "炖罐汤", price: 6, sales: 640, emoji: "🍲", desc: "排骨/乌鸡每日轮换" },
    { id: "F05-03", restaurantId: "F05", name: "蒸饺（8个）", price: 9, sales: 520, emoji: "🥟", desc: "猪肉玉米馅" },
    { id: "F05-04", restaurantId: "F05", name: "卤蛋豆腐干", price: 4, sales: 380, emoji: "🥚", desc: "古法卤制" },
    { id: "F05-05", restaurantId: "F05", name: "瓦罐煨汤套餐", price: 12, sales: 300, emoji: "🥘", desc: "拌面+炖罐组合" },
    { id: "F06-01", restaurantId: "F06", name: "当季西瓜盒", price: 12.9, sales: 420, emoji: "🍉", desc: "现切半盒约 500g" },
    { id: "F06-02", restaurantId: "F06", name: "草莓礼盒", price: 25.9, sales: 260, emoji: "🍓", desc: "丹东红颜约 750g" },
    { id: "F06-03", restaurantId: "F06", name: "芒果切盒", price: 15.9, sales: 300, emoji: "🥭", desc: "贵妃芒现切 400g" },
    { id: "F06-04", restaurantId: "F06", name: "阳光玫瑰葡萄", price: 22.9, sales: 180, emoji: "🍇", desc: "无籽脆甜 500g" },
    { id: "F06-05", restaurantId: "F06", name: "鲜榨橙汁", price: 13, sales: 220, emoji: "🍊", desc: "两颗鲜橙现榨" },
    { id: "F07-01", restaurantId: "F07", name: "羊肉串（10串）", price: 30, sales: 380, emoji: "🍢", desc: "炭火现烤，撒孜然" },
    { id: "F07-02", restaurantId: "F07", name: "烤韭菜", price: 10, sales: 260, emoji: "🥬", desc: "锡纸烤制" },
    { id: "F07-03", restaurantId: "F07", name: "烤茄子", price: 12, sales: 240, emoji: "🍆", desc: "蒜蓉酱汁" },
    { id: "F07-04", restaurantId: "F07", name: "掌中宝", price: 18, sales: 200, emoji: "🍗", desc: "脆骨口感，微辣" },
    { id: "F07-05", restaurantId: "F07", name: "冰镇酸梅汤", price: 8, sales: 320, emoji: "🥤", desc: "500ml 冰镇" },
    { id: "F07-06", restaurantId: "F07", name: "炒河粉", price: 14, sales: 180, emoji: "🍝", desc: "广式湿炒，加蛋" },
  ],

  companies: [
    { name: "顺丰速运", shortName: "SF", color: "#1E40AF" },
    { name: "中通快递", shortName: "ZT", color: "#0EA5E9" },
    { name: "圆通速递", shortName: "YT", color: "#7C3AED" },
    { name: "韵达快递", shortName: "YD", color: "#003DA5" },
    { name: "京东物流", shortName: "JD", color: "#DC2626" },
    { name: "极兔速递", shortName: "JT", color: "#F97316" },
    { name: "申通快递", shortName: "ST", color: "#0891B2" },
  ],

  // 校区列表（支持校区切换）
  campuses: [
    { id: "hanjiang", name: "涵江校区", desc: "主校区 · 兰苑/楷苑/菊苑/梅苑" },
    { id: "xianyou",  name: "仙游校区", desc: "分校区 · 兰香园/桂香园/菊香园" },
  ],

  // 接入的微信小程序合作伙伴（仅展示入口，无法直接拉起小程序）
  // QR 内容为小程序分享口令，仅作示意；用户需用微信扫码体验
  miniPrograms: [
    {
      id: "MP01",
      name: "有食美食集丨H",
      desc: "校园周边美食集合，海量商家任选",
      shareKey: "#小程序://有食美食集丨H/gIdPMQsijyAMErm",
      qrContent: "https://weixin.qq.com/r/demo-mp-youshi-food",
      tags: ["满减", "新客优惠", "免配送费"],
      color: "#10B981",
      emoji: "🍱",
    },
    {
      id: "MP02",
      name: "学长外卖L丨涵江店",
      desc: "学长学姐自营外卖，涵江校区直达",
      shareKey: "#小程序://学长外卖L丨涵江店/xAKwPmGG6i81qsx",
      qrContent: "https://weixin.qq.com/r/demo-mp-xuezhang-001",
      tags: ["学生自营", "涵江专送", "起送低"],
      color: "#2563EB",
      emoji: "🛵",
    },
    {
      id: "MP03",
      name: "湄食校园生活圈",
      desc: "校园生活 + 美食 + 社区一体化平台",
      shareKey: "#小程序://湄食校园生活圈/Cfp2vdk52EZYE7I",
      qrContent: "https://weixin.qq.com/r/demo-mp-meishi-life",
      tags: ["生活圈", "校园社区", "福利多"],
      color: "#F97316",
      emoji: "🏪",
    },
  ],
};

// demo 模式下整体替换 mock.js 的 DB —— 所有种子数据与直接引用（DB.xxx）随之切换为虚拟数据
if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.isDemo) {
  DB = DEMO_DATA;
}
