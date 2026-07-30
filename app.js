/* ============================================
   物品位置记录 App - 主逻辑
   ============================================ */

(function() {
  'use strict';

  /* ========================================
     工具函数
     ======================================== */
  const Utils = {
    escapeHtml(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    escapeRegex(str) {
      return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    formatDateTime(timestamp) {
      const d = new Date(timestamp);
      const now = new Date();
      const diff = now - timestamp;
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
      if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
      if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + '天前';
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day} ${hours}:${mins}`;
    },

    formatFullDateTime(timestamp) {
      const d = new Date(timestamp);
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day} ${hours}:${mins}`;
    },

    genId() {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    },

    highlightKeyword(text, keyword) {
      const escaped = Utils.escapeHtml(text);
      if (!keyword) return escaped;
      const regex = new RegExp(`(${Utils.escapeRegex(keyword)})`, 'gi');
      return escaped.replace(regex, '<mark>$1</mark>');
    }
  };

  /* ========================================
     Toast / Loading / Modal
     ======================================== */
  const UI = {
    toastTimer: null,

    toast(message, duration = 2200) {
      const el = document.getElementById('toast');
      el.textContent = message;
      el.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => el.classList.remove('show'), duration);
    },

    showLoading() {
      let overlay = document.querySelector('.loading-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = '<div class="spinner"></div>';
        document.body.appendChild(overlay);
      }
      overlay.classList.add('show');
    },

    hideLoading() {
      const overlay = document.querySelector('.loading-overlay');
      if (overlay) overlay.classList.remove('show');
    },

    confirm(title, body) {
      return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal">
            <div class="modal-title">${Utils.escapeHtml(title)}</div>
            <div class="modal-body">${Utils.escapeHtml(body)}</div>
            <div class="modal-buttons">
              <button class="btn btn-outline" data-action="cancel">取消</button>
              <button class="btn btn-primary" data-action="ok">确认</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        overlay.addEventListener('click', e => {
          const action = e.target.dataset.action;
          if (action === 'ok') {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 200);
            resolve(true);
          } else if (action === 'cancel' || e.target === overlay) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 200);
            resolve(false);
          }
        });
      });
    }
  };

  /* ========================================
     数据存储层
     ======================================== */
  const Store = {
    STORAGE_KEY: 'itemLocator_data',

    getAll() {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (!raw) return { items: [], version: '1.0' };
        return JSON.parse(raw);
      } catch (e) {
        console.error('数据读取失败', e);
        return { items: [], version: '1.0' };
      }
    },

    saveAll(data) {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          UI.toast('存储空间不足，请删除一些物品');
        }
        return false;
      }
    },

    getItems() {
      return this.getAll().items;
    },

    getById(id) {
      return this.getAll().items.find(i => i.id === id);
    },

    add(item) {
      const data = this.getAll();
      data.items.unshift(item);
      return this.saveAll(data);
    },

    update(id, updates) {
      const data = this.getAll();
      const item = data.items.find(i => i.id === id);
      if (!item) return false;
      Object.assign(item, updates);
      item.updatedAt = Date.now();
      return this.saveAll(data);
    },

    addLocationRecord(id, location, note) {
      const data = this.getAll();
      const item = data.items.find(i => i.id === id);
      if (!item) return false;
      const now = Date.now();
      item.locationHistory.unshift({
        location: location.trim(),
        timestamp: now,
        note: (note || '').trim()
      });
      item.updatedAt = now;
      return this.saveAll(data);
    },

    delete(id) {
      const data = this.getAll();
      data.items = data.items.filter(i => i.id !== id);
      return this.saveAll(data);
    },

    search(keyword) {
      if (!keyword || !keyword.trim()) return [];
      const kw = keyword.trim().toLowerCase();
      return this.getAll().items.filter(item => {
        if (item.name.toLowerCase().includes(kw)) return true;
        if (item.description && item.description.toLowerCase().includes(kw)) return true;
        return item.locationHistory.some(r => r.location.toLowerCase().includes(kw));
      });
    },

    getStorageUsage() {
      const data = localStorage.getItem(this.STORAGE_KEY) || '';
      const bytes = new Blob([data]).size;
      return {
        usedKB: Math.round(bytes / 1024),
        percent: Math.round((bytes / (5 * 1024 * 1024)) * 100)
      };
    }
  };

  /* ========================================
     图片处理
     ======================================== */
  const ImageProcessor = {
    MAX_WIDTH: 800,
    MAX_HEIGHT: 800,
    TARGET_SIZE: 100 * 1024,
    MIN_QUALITY: 0.3,

    async compress(file) {
      const dataUrl = await this.fileToDataUrl(file);
      const img = await this.loadImage(dataUrl);
      const { width, height } = this.calculateSize(img.width, img.height, this.MAX_WIDTH, this.MAX_HEIGHT);
      let quality = 0.7;
      let result = await this.compressToCanvas(img, width, height, quality);
      while (result.length > this.TARGET_SIZE && quality > this.MIN_QUALITY) {
        quality -= 0.1;
        result = await this.compressToCanvas(img, width, height, quality);
      }
      return result;
    },

    fileToDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    },

    loadImage(src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
      });
    },

    calculateSize(origW, origH, maxW, maxH) {
      let width = origW, height = origH;
      if (width > maxW) {
        height = (height * maxW) / width;
        width = maxW;
      }
      if (height > maxH) {
        width = (width * maxH) / height;
        height = maxH;
      }
      return { width: Math.round(width), height: Math.round(height) };
    },

    compressToCanvas(img, width, height, quality) {
      return new Promise(resolve => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      });
    }
  };

  /* ========================================
     当前状态
     ======================================== */
  const State = {
    currentPhoto: null,
    editingPhoto: null
  };

  /* ========================================
     路由
     ======================================== */
  const Router = {
    init() {
      window.addEventListener('hashchange', () => this.handleRoute());
      this.handleRoute();
    },

    navigate(hash) {
      window.location.hash = hash;
    },

    handleRoute() {
      const hash = window.location.hash || '#/';
      const view = document.getElementById('view-container');
      const fab = document.getElementById('fab-add');
      const backBtn = document.getElementById('btn-back');
      const searchBtn = document.getElementById('btn-search');
      const title = document.getElementById('header-title');
      window.scrollTo(0, 0);

      if (hash === '#/' || hash === '') {
        title.textContent = '物品位置记录';
        backBtn.classList.add('hidden');
        searchBtn.classList.remove('hidden');
        fab.classList.remove('hidden');
        View.renderList(view);
      } else if (hash === '#/add') {
        title.textContent = '添加物品';
        backBtn.classList.remove('hidden');
        searchBtn.classList.add('hidden');
        fab.classList.add('hidden');
        View.renderAdd(view);
      } else if (hash === '#/search') {
        title.textContent = '搜索物品';
        backBtn.classList.remove('hidden');
        searchBtn.classList.add('hidden');
        fab.classList.add('hidden');
        View.renderSearch(view);
      } else {
        // 先匹配带操作后缀的路由：#/detail/:id/update-location 或 #/detail/:id/edit
        const actionMatch = hash.match(/^#\/detail\/(.+?)\/(update-location|edit)$/);
        // 再匹配纯详情页：#/detail/:id
        const detailMatch = hash.match(/^#\/detail\/(.+)$/);

        if (actionMatch) {
          const id = actionMatch[1];
          const action = actionMatch[2];
          const item = Store.getById(id);
          if (!item) {
            UI.toast('物品不存在');
            Router.navigate('#/');
            return;
          }
          if (action === 'update-location') {
            title.textContent = '更新位置';
            backBtn.classList.remove('hidden');
            searchBtn.classList.add('hidden');
            fab.classList.add('hidden');
            View.renderUpdateLocation(view, item);
          } else if (action === 'edit') {
            title.textContent = '编辑物品';
            backBtn.classList.remove('hidden');
            searchBtn.classList.add('hidden');
            fab.classList.add('hidden');
            View.renderEdit(view, item);
          }
        } else if (detailMatch) {
          const id = detailMatch[1];
          const item = Store.getById(id);
          if (!item) {
            UI.toast('物品不存在');
            Router.navigate('#/');
            return;
          }
          title.textContent = '物品详情';
          backBtn.classList.remove('hidden');
          searchBtn.classList.add('hidden');
          fab.classList.add('hidden');
          View.renderDetail(view, item);
        } else {
          Router.navigate('#/');
        }
      }
    }
  };

  /* ========================================
     视图渲染
     ======================================== */
  const View = {

    /* ---- 首页列表 ---- */
    renderList(container) {
      const items = Store.getItems();
      const usage = Store.getStorageUsage();

      if (items.length === 0) {
        container.innerHTML = `
          <div class="empty-state fade-in">
            <div class="empty-state-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                <line x1="12" y1="22.08" x2="12" y2="12"></line>
              </svg>
            </div>
            <div class="empty-state-title">还没有记录任何物品</div>
            <div class="empty-state-desc">点击右下角 + 按钮，开始记录物品位置</div>
          </div>
        `;
        return;
      }

      const locationIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
      const placeholderIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

      container.innerHTML = `
        <div class="stats-bar fade-in">
          <div class="stat-chip">
            <div class="stat-chip-value">${items.length}</div>
            <div class="stat-chip-label">物品总数</div>
          </div>
          <div class="stat-chip">
            <div class="stat-chip-value">${items.filter(i => i.photo).length}</div>
            <div class="stat-chip-label">有图片</div>
          </div>
          <div class="stat-chip">
            <div class="stat-chip-value">${usage.usedKB}KB</div>
            <div class="stat-chip-label">已用空间</div>
          </div>
        </div>
        <div class="item-list fade-in">
          ${items.map(item => {
            const currentLoc = item.locationHistory[0];
            return `
              <div class="item-card" data-id="${item.id}">
                ${item.photo
                  ? `<img class="item-card-thumb" src="${item.photo}" alt="">`
                  : `<div class="item-card-thumb-placeholder">${placeholderIcon}</div>`
                }
                <div class="item-card-info">
                  <div class="item-card-name">${Utils.escapeHtml(item.name)}</div>
                  <div class="item-card-location">${locationIcon}${Utils.escapeHtml(currentLoc ? currentLoc.location : '未知位置')}</div>
                  <div class="item-card-time">${Utils.formatDateTime(item.updatedAt)}</div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      container.querySelectorAll('.item-card').forEach(card => {
        card.addEventListener('click', () => {
          Router.navigate(`#/detail/${card.dataset.id}`);
        });
      });
    },

    /* ---- 添加物品 ---- */
    renderAdd(container) {
      State.currentPhoto = null;
      const cameraIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
      const galleryIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

      container.innerHTML = `
        <div class="fade-in">
          <div class="photo-section">
            <div class="form-label">物品照片（可选）</div>
            <div class="photo-buttons">
              <button class="photo-btn" id="btn-camera">${cameraIcon}<span>拍照</span></button>
              <button class="photo-btn" id="btn-gallery">${galleryIcon}<span>相册</span></button>
            </div>
            <div id="photo-preview-area"></div>
          </div>

          <div class="form-group">
            <label class="form-label">物品名称<span class="required">*</span></label>
            <input type="text" class="form-input" id="input-name" placeholder="如：护照、钥匙、充电器" maxlength="50">
          </div>

          <div class="form-group">
            <label class="form-label">存放位置<span class="required">*</span></label>
            <input type="text" class="form-input" id="input-location" placeholder="如：书房抽屉第二格" maxlength="100">
          </div>

          <div class="form-group">
            <label class="form-label">位置备注（可选）</label>
            <input type="text" class="form-input" id="input-note" placeholder="如：放在文件夹后面" maxlength="100">
          </div>

          <div class="form-group">
            <label class="form-label">物品描述（可选）</label>
            <textarea class="form-textarea" id="input-description" placeholder="物品的详细描述..." maxlength="500"></textarea>
          </div>

          <div class="form-hint" style="margin-bottom:16px;">
            位置记录时间将自动设为当前：${Utils.formatFullDateTime(Date.now())}
          </div>

          <button class="btn btn-primary" id="btn-save">保存物品</button>
        </div>
      `;

      this._setupPhotoHandlers(container, 'add');
      this._setupSaveHandler(container, 'add');
    },

    /* ---- 编辑物品 ---- */
    renderEdit(container, item) {
      State.editingPhoto = item.photo;
      const cameraIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
      const galleryIcon = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;

      container.innerHTML = `
        <div class="fade-in">
          <div class="photo-section">
            <div class="form-label">物品照片</div>
            <div class="photo-buttons">
              <button class="photo-btn" id="btn-camera">${cameraIcon}<span>拍照</span></button>
              <button class="photo-btn" id="btn-gallery">${galleryIcon}<span>相册</span></button>
            </div>
            <div id="photo-preview-area"></div>
          </div>

          <div class="form-group">
            <label class="form-label">物品名称<span class="required">*</span></label>
            <input type="text" class="form-input" id="input-name" value="${Utils.escapeHtml(item.name)}" maxlength="50">
          </div>

          <div class="form-group">
            <label class="form-label">物品描述（可选）</label>
            <textarea class="form-textarea" id="input-description" maxlength="500">${Utils.escapeHtml(item.description || '')}</textarea>
          </div>

          <button class="btn btn-primary" id="btn-save">保存修改</button>
        </div>
      `;

      // 显示已有照片
      if (item.photo) {
        this._showPhotoPreview(container, item.photo, 'edit');
      }

      this._setupPhotoHandlers(container, 'edit');
      this._setupSaveHandler(container, 'edit', item.id);
    },

    /* ---- 物品详情 ---- */
    renderDetail(container, item) {
      const currentLoc = item.locationHistory[0];
      const placeholderIcon = `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`;

      container.innerHTML = `
        <div class="fade-in">
          ${item.photo
            ? `<img class="detail-photo" src="${item.photo}" alt="">`
            : `<div class="detail-photo-placeholder">${placeholderIcon}</div>`
          }

          <div class="detail-card">
            <div class="detail-name">${Utils.escapeHtml(item.name)}</div>
            ${item.description ? `<div class="detail-description">${Utils.escapeHtml(item.description)}</div>` : ''}

            <div class="current-location-box">
              <div class="current-location-label">当前位置</div>
              <div class="current-location-value">${Utils.escapeHtml(currentLoc ? currentLoc.location : '未知')}</div>
              <div class="current-location-time">${currentLoc ? Utils.formatFullDateTime(currentLoc.timestamp) : ''}</div>
            </div>
          </div>

          <div class="detail-card">
            <div class="detail-section-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
              位置变更历史
            </div>
            <div class="timeline">
              ${item.locationHistory.map((record, index) => `
                <div class="timeline-item ${index === 0 ? 'current' : ''}">
                  <div class="timeline-dot"></div>
                  <div class="timeline-location">${Utils.escapeHtml(record.location)}</div>
                  <div class="timeline-time">${Utils.formatFullDateTime(record.timestamp)}</div>
                  ${record.note ? `<div class="timeline-note">${Utils.escapeHtml(record.note)}</div>` : ''}
                </div>
              `).join('')}
            </div>
          </div>

          <button class="btn btn-primary btn-block" id="btn-update-location">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            更新位置
          </button>
          <button class="btn btn-outline btn-block" id="btn-edit">编辑物品</button>
          <button class="btn btn-danger btn-block" id="btn-delete">删除物品</button>
        </div>
      `;

      container.querySelector('#btn-update-location').addEventListener('click', () => {
        Router.navigate(`#/detail/${item.id}/update-location`);
      });
      container.querySelector('#btn-edit').addEventListener('click', () => {
        Router.navigate(`#/detail/${item.id}/edit`);
      });
      container.querySelector('#btn-delete').addEventListener('click', async () => {
        const ok = await UI.confirm('删除物品', `确定要删除"${item.name}"吗？此操作不可撤销。`);
        if (ok) {
          Store.delete(item.id);
          UI.toast('已删除');
          Router.navigate('#/');
        }
      });
    },

    /* ---- 更新位置 ---- */
    renderUpdateLocation(container, item) {
      const currentLoc = item.locationHistory[0];
      container.innerHTML = `
        <div class="fade-in">
          <div class="detail-card">
            <div class="detail-name" style="font-size:18px;">${Utils.escapeHtml(item.name)}</div>
            <div class="current-location-box">
              <div class="current-location-label">当前位置</div>
              <div class="current-location-value">${Utils.escapeHtml(currentLoc ? currentLoc.location : '未知')}</div>
              <div class="current-location-time">${currentLoc ? Utils.formatFullDateTime(currentLoc.timestamp) : ''}</div>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">新位置<span class="required">*</span></label>
            <input type="text" class="form-input" id="input-new-location" placeholder="输入物品的新存放位置" maxlength="100">
          </div>

          <div class="form-group">
            <label class="form-label">备注（可选）</label>
            <input type="text" class="form-input" id="input-note" placeholder="如：搬到新位置的原因" maxlength="100">
          </div>

          <div class="form-hint" style="margin-bottom:16px;">
            记录时间将自动设为当前：${Utils.formatFullDateTime(Date.now())}
          </div>

          <button class="btn btn-primary" id="btn-save-location">确认更新</button>
        </div>
      `;

      container.querySelector('#btn-save-location').addEventListener('click', () => {
        const newLoc = container.querySelector('#input-new-location').value.trim();
        const note = container.querySelector('#input-note').value.trim();
        if (!newLoc) {
          UI.toast('请输入新位置');
          return;
        }
        Store.addLocationRecord(item.id, newLoc, note);
        UI.toast('位置已更新');
        Router.navigate(`#/detail/${item.id}`);
      });
    },

    /* ---- 搜索 ---- */
    renderSearch(container) {
      const searchIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
      const clearIcon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      const placeholderIcon = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      const locationIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;

      container.innerHTML = `
        <div class="fade-in">
          <div class="search-box">
            <span class="search-icon-left">${searchIcon}</span>
            <input type="text" class="search-input" id="search-input" placeholder="输入物品名称、描述或位置..." autofocus>
            <button class="search-clear" id="search-clear">${clearIcon}</button>
          </div>
          <div id="search-results"></div>
        </div>
      `;

      const input = container.querySelector('#search-input');
      const clearBtn = container.querySelector('#search-clear');
      const results = container.querySelector('#search-results');

      const doSearch = () => {
        const kw = input.value.trim();
        clearBtn.classList.toggle('visible', kw.length > 0);

        if (!kw) {
          results.innerHTML = `
            <div class="empty-state" style="padding-top:40px;">
              <div class="empty-state-desc">输入关键词搜索物品</div>
            </div>
          `;
          return;
        }

        const items = Store.search(kw);
        if (items.length === 0) {
          results.innerHTML = `
            <div class="empty-state" style="padding-top:40px;">
              <div class="empty-state-title">未找到匹配的物品</div>
              <div class="empty-state-desc">试试其他关键词</div>
            </div>
          `;
          return;
        }

        results.innerHTML = `
          <div class="item-list">
            ${items.map(item => {
              const currentLoc = item.locationHistory[0];
              return `
                <div class="item-card" data-id="${item.id}">
                  ${item.photo
                    ? `<img class="item-card-thumb" src="${item.photo}" alt="">`
                    : `<div class="item-card-thumb-placeholder">${placeholderIcon}</div>`
                  }
                  <div class="item-card-info">
                    <div class="item-card-name">${Utils.highlightKeyword(item.name, kw)}</div>
                    <div class="item-card-location">${locationIcon}${Utils.highlightKeyword(currentLoc ? currentLoc.location : '', kw)}</div>
                    <div class="item-card-time">${Utils.formatDateTime(item.updatedAt)}</div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        results.querySelectorAll('.item-card').forEach(card => {
          card.addEventListener('click', () => {
            Router.navigate(`#/detail/${card.dataset.id}`);
          });
        });
      };

      input.addEventListener('input', doSearch);
      clearBtn.addEventListener('click', () => {
        input.value = '';
        doSearch();
        input.focus();
      });

      // 自动聚焦
      setTimeout(() => input.focus(), 100);
      doSearch();
    },

    /* ---- 图片处理辅助 ---- */
    _setupPhotoHandlers(container, mode) {
      const cameraInput = document.getElementById('camera-input');
      const galleryInput = document.getElementById('gallery-input');

      const btnCamera = container.querySelector('#btn-camera');
      const btnGallery = container.querySelector('#btn-gallery');

      if (btnCamera) {
        btnCamera.addEventListener('click', () => cameraInput.click());
      }
      if (btnGallery) {
        btnGallery.addEventListener('click', () => galleryInput.click());
      }

      const handler = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        e.target.value = '';

        UI.showLoading();
        try {
          const compressed = await ImageProcessor.compress(file);
          if (mode === 'edit') {
            State.editingPhoto = compressed;
          } else {
            State.currentPhoto = compressed;
          }
          View._showPhotoPreview(container, compressed, mode);
        } catch (err) {
          UI.toast('图片处理失败，请重试');
        }
        UI.hideLoading();
      };

      cameraInput.onchange = handler;
      galleryInput.onchange = handler;
    },

    _showPhotoPreview(container, photoData, mode) {
      const area = container.querySelector('#photo-preview-area');
      area.innerHTML = `
        <div class="photo-preview">
          <img src="${photoData}" alt="预览">
          <button class="photo-preview-remove" data-mode="${mode}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      `;
      area.querySelector('.photo-preview-remove').addEventListener('click', () => {
        area.innerHTML = '';
        if (mode === 'edit') {
          State.editingPhoto = null;
        } else {
          State.currentPhoto = null;
        }
      });
    },

    _setupSaveHandler(container, mode, editId) {
      const saveBtn = container.querySelector('#btn-save');

      saveBtn.addEventListener('click', () => {
        const name = container.querySelector('#input-name').value.trim();
        const description = container.querySelector('#input-description') ? container.querySelector('#input-description').value.trim() : '';

        if (!name) {
          UI.toast('请输入物品名称');
          return;
        }

        if (mode === 'add') {
          const location = container.querySelector('#input-location').value.trim();
          const note = container.querySelector('#input-note').value.trim();
          if (!location) {
            UI.toast('请输入存放位置');
            return;
          }

          const now = Date.now();
          const item = {
            id: Utils.genId(),
            name,
            description,
            photo: State.currentPhoto || null,
            createdAt: now,
            updatedAt: now,
            locationHistory: [{
              location,
              timestamp: now,
              note
            }]
          };
          Store.add(item);
          State.currentPhoto = null;
          UI.toast('物品已添加');
          Router.navigate('#/');

        } else if (mode === 'edit') {
          Store.update(editId, {
            name,
            description,
            photo: State.editingPhoto || null
          });
          State.editingPhoto = null;
          UI.toast('已保存修改');
          Router.navigate(`#/detail/${editId}`);
        }
      });
    }
  };

  /* ========================================
     顶部按钮事件
     ======================================== */
  function setupHeaderButtons() {
    document.getElementById('btn-back').addEventListener('click', () => {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        Router.navigate('#/');
      }
    });

    document.getElementById('btn-search').addEventListener('click', () => {
      Router.navigate('#/search');
    });

    document.getElementById('fab-add').addEventListener('click', () => {
      Router.navigate('#/add');
    });
  }

  /* ========================================
     Service Worker 注册
     ======================================== */
  function registerServiceWorker() {
    // file:// 协议下不支持 Service Worker，跳过
    if (window.location.protocol === 'file:') return;
    if (!('serviceWorker' in navigator)) return;
    try {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('SW 注册成功', reg.scope))
          .catch(err => console.warn('SW 注册失败', err));
      });
    } catch (e) {
      console.warn('SW 注册异常', e);
    }
  }

  /* ========================================
     初始化
     ======================================== */
  function init() {
    setupHeaderButtons();
    Router.init();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
