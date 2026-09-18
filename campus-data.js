// campus-data.js — 宿舍园区/楼栋/浴室数据（同步加载，兼容 file:// 和 http://）
// 数据源对应 assets/data/campus-buildings.json，增加新苑区/楼栋时改本文件即可，无需改页面代码
// 在 storage.js 之前引入，设置全局 window.CAMPUS_DATA

var CAMPUS_DATA = {
  campuses: [
    {
      id: 'hanjiang',
      name: '涵江校区',
      areas: [
        { id: 'zhuyuan',  name: '竹苑', buildings: ['1号楼','2号楼','3号楼','4号楼','5号楼','6号楼'] },
        { id: 'juyuan',   name: '菊苑', buildings: ['1号楼','2号楼','3号楼','4号楼','5号楼'] },
        { id: 'lanyuan',  name: '兰苑', buildings: ['1号楼','2号楼','3号楼','4号楼','5号楼'] },
        { id: 'kaiyuan',  name: '楷苑', buildings: ['1号楼','2号楼','3号楼'] },
        { id: 'meiyuan',  name: '梅苑', buildings: ['1号楼','2号楼','3号楼'] }
      ]
    },
    {
      id: 'xianyou',
      name: '仙游校区',
      areas: [
        { id: 'lanxiang', name: '兰香园', buildings: ['1号楼','2号楼','3号楼'] },
        { id: 'guixiang', name: '桂香园', buildings: ['1号楼','2号楼'] },
        { id: 'juxiang',  name: '菊香园', buildings: ['1号楼','2号楼'] }
      ]
    }
  ],
  bathrooms: [
    { id: 'bath-zhuyuan-1-2f',  campusId: 'hanjiang', areaId: 'zhuyuan',  building: '1号楼', floor: '2F', name: '竹苑1号楼2F浴室', distance: 40, hours: '06:30–23:30', mapPos: { x: 85,  y: 60,  floor: 2 } },
    { id: 'bath-zhuyuan-3-2f',  campusId: 'hanjiang', areaId: 'zhuyuan',  building: '3号楼', floor: '2F', name: '竹苑3号楼2F浴室', distance: 45, hours: '06:30–23:30', mapPos: { x: 120, y: 80,  floor: 2 } },
    { id: 'bath-zhuyuan-5-1f',  campusId: 'hanjiang', areaId: 'zhuyuan',  building: '5号楼', floor: '1F', name: '竹苑5号楼1F浴室', distance: 55, hours: '06:30–23:30', mapPos: { x: 150, y: 100, floor: 1 } },
    { id: 'bath-juyuan-2-2f',   campusId: 'hanjiang', areaId: 'juyuan',   building: '2号楼', floor: '2F', name: '菊苑2号楼2F浴室', distance: 50, hours: '06:30–23:30', mapPos: { x: 200, y: 70,  floor: 2 } },
    { id: 'bath-juyuan-4-1f',   campusId: 'hanjiang', areaId: 'juyuan',   building: '4号楼', floor: '1F', name: '菊苑4号楼1F浴室', distance: 60, hours: '06:30–23:30', mapPos: { x: 230, y: 90,  floor: 1 } },
    { id: 'bath-lanyuan-3-2f',  campusId: 'hanjiang', areaId: 'lanyuan',  building: '3号楼', floor: '2F', name: '兰苑3号楼2F浴室', distance: 42, hours: '06:30–23:30', mapPos: { x: 280, y: 65,  floor: 2 } },
    { id: 'bath-lanyuan-5-1f',  campusId: 'hanjiang', areaId: 'lanyuan',  building: '5号楼', floor: '1F', name: '兰苑5号楼1F浴室', distance: 48, hours: '06:30–23:30', mapPos: { x: 310, y: 85,  floor: 1 } },
    { id: 'bath-kaiyuan-2-2f',  campusId: 'hanjiang', areaId: 'kaiyuan',  building: '2号楼', floor: '2F', name: '楷苑2号楼2F浴室', distance: 38, hours: '06:30–23:30', mapPos: { x: 360, y: 70,  floor: 2 } },
    { id: 'bath-meiyuan-1-2f',  campusId: 'hanjiang', areaId: 'meiyuan',  building: '1号楼', floor: '2F', name: '梅苑1号楼2F浴室', distance: 52, hours: '06:30–23:30', mapPos: { x: 400, y: 95,  floor: 2 } },
    { id: 'bath-lanxiang-2-2f', campusId: 'xianyou',  areaId: 'lanxiang', building: '2号楼', floor: '2F', name: '兰香园2号楼2F浴室', distance: 45, hours: '06:30–23:30', mapPos: { x: 100, y: 90,  floor: 2 } },
    { id: 'bath-guixiang-1-2f', campusId: 'xianyou',  areaId: 'guixiang', building: '1号楼', floor: '2F', name: '桂香园1号楼2F浴室', distance: 50, hours: '06:30–23:30', mapPos: { x: 160, y: 110, floor: 2 } }
  ]
};
