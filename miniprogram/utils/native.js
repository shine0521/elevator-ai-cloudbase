// 现场能力封装：扫码 / 拍照 / GPS（M-04/M-06/M-09/M-11 使用）
module.exports = {
  scanCode() {
    return new Promise((res, rej) => wx.scanCode({ success: r => res(r.result), fail: rej }));
  },
  chooseImage(max = 3) {
    return new Promise((res, rej) => wx.chooseMedia({
      count: max, mediaType: ['image'], sizeType: ['compressed'],
      success: r => res(r.tempFiles.map(f => f.tempFilePath)), fail: rej
    }));
  },
  getLocation() {
    return new Promise((res, rej) => wx.getLocation({
      type: 'gcj02', success: r => res({ lat: r.latitude, lng: r.longitude }), fail: rej
    }));
  }
};
