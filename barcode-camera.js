/* Shared retail barcode camera. All frames stay on the device. */
(() => {
  'use strict';
  let libraryLoading;
  const quality = {width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}};
  const message = error => {
    if (error?.name === 'NotAllowedError' || /permission|denied/i.test(String(error))) return 'กรุณาอนุญาตกล้องในเบราว์เซอร์ แล้วเปิดกล้องอีกครั้ง';
    if (error?.name === 'NotFoundError') return 'ไม่พบกล้องที่เลือก กรุณาเลือกกล้องอื่นหรือพิมพ์บาร์โค้ด';
    if (error?.name === 'NotReadableError') return 'กล้องกำลังถูกใช้งาน กรุณาปิดแอพที่ใช้กล้องแล้วลองอีกครั้ง';
    return error?.message || 'เปิดกล้องไม่ได้ กรุณาเปิดผ่าน Chrome/Safari หรือพิมพ์บาร์โค้ด';
  };
  async function loadLibrary() {
    if (window.Html5Qrcode) return;
    if (!libraryLoading) libraryLoading = new Promise((resolve,reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/html5-qrcode.min.js';
      script.onload = resolve;
      script.onerror = () => { script.remove();reject(new Error('โหลดตัวสแกนไม่ได้ กรุณาลองใหม่หรือพิมพ์บาร์โค้ด')); };
      document.head.append(script);
    }).catch(error => {libraryLoading = null;throw error;});
    await libraryLoading;
  }
  const readSettings = scanner => {try{return scanner.getRunningTrackSettings?.() || {};}catch{return {};}};
  const readCapabilities = scanner => {try{return scanner.getRunningTrackCapabilities?.() || {};}catch{return {};}};
  const range = value => value && Number.isFinite(value.min) && Number.isFinite(value.max) && value.max > value.min;
  const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

  function create({boxId,readerId,onDetected,onError}) {
    const reader = document.getElementById(readerId), box = document.getElementById(boxId);
    const ui = name => box.querySelector('[data-camera-'+name+']');
    const hint = ui('hint'), status = ui('status'), camera = ui('select'), cameraLabel = ui('choice');
    const zoom = ui('zoom'), zoomLabel = ui('zoom-label'), zoomValue = ui('zoom-value');
    const torch = ui('torch'), focus = ui('focus');
    let generation = 0, current = null, lifecycle = Promise.resolve(), controls = Promise.resolve(), chosenDevice = '';
    const live = session => current === session && session.generation === generation && session.ready && !session.handled;
    function enqueue(task) {
      const next = lifecycle.then(task,task);
      lifecycle = next.catch(() => {});
      return next;
    }
    function resetControls() {
      zoomLabel.hidden = torch.hidden = focus.hidden = cameraLabel.hidden = true;
      camera.disabled = true;torch.disabled = focus.disabled = zoom.disabled = false;
      torch.textContent = 'เปิดไฟฉาย';torch.setAttribute('aria-pressed','false');
      hint.textContent = 'ถือห่างป้ายประมาณ 15–30 ซม. ให้เห็นบาร์โค้ดครบ และถือให้นิ่ง ถ้าตัวเลขเบลอให้ถอยแล้วเพิ่มซูม';
      status.textContent = 'กำลังเปิดกล้อง…';
    }
    async function dispose(session) {
      if (!session) return;
      session.nativeStopped = true;clearTimeout(session.nativeTimer);
      if (session.ready) {try{await session.scanner.stop();}catch{}}
      // Also release a stream if opening was cancelled or stop() failed.
      for (const video of reader.querySelectorAll('video')) {
        for (const track of video.srcObject?.getTracks?.() || []) track.stop();
      }
      try{session.scanner.clear();}catch{}
      session.ready = false;
      if (current === session) current = null;
    }
    async function nativeScan(session,detected) {
      if (!window.BarcodeDetector) return;
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        if(!live(session))return;
        const formats = ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf'].filter(format => supported.includes(format));
        if(!formats.length)return;
        const detector = new window.BarcodeDetector({formats});
        const tick = async () => {
          if (!live(session) || session.nativeStopped) return;
          try {
            const video = reader.querySelector('video');
            if (video?.readyState >= 2) {
              // Native detection sees the original video pixels, not the small
              // preview canvas used by the cross-browser decoder.
              const found = await detector.detect(video);
              if(live(session))for(const barcode of found)detected(barcode.rawValue);
            }
          } catch {} // Keep the cross-browser decoder available on native failure.
          if(live(session) && !session.nativeStopped)session.nativeTimer = setTimeout(tick,160);
        };
        tick();
      } catch {} // Native detection is optional.
    }
    async function stop() {
      ++generation;box.hidden = true;
      return enqueue(async () => {await controls;await dispose(current);});
    }
    async function apply(session,patch) {
      if (!live(session)) return false;
      const next = {...session.desired,...patch};
      await session.scanner.applyVideoConstraints({...session.quality,advanced:[next]});
      if (!live(session)) return false;
      const settings = readSettings(session.scanner);
      for (const [key,value] of Object.entries(patch)) {
        if (settings[key] !== undefined && (typeof value === 'number' ? Math.abs(settings[key]-value) > 0.06 : settings[key] !== value)) {
          throw new Error('กล้องไม่ยอมปรับค่านี้');
        }
      }
      session.desired = next;
      return true;
    }
    function control(action) {
      const session = current;
      if (!session || !live(session)) return Promise.resolve();
      const run = controls.then(async () => {
        if (!live(session)) return;
        torch.disabled = focus.disabled = zoom.disabled = true;
        try {await action(session);}
        catch {if(live(session))status.textContent = 'ปรับกล้องไม่ได้ ลองเปลี่ยนกล้องหรือขยับระยะห่างจากป้าย';}
        finally {if(live(session))torch.disabled = focus.disabled = zoom.disabled = false;}
      });
      controls = run.catch(() => {});
      return run;
    }
    async function configure(session) {
      const capabilities = readCapabilities(session.scanner), settings = readSettings(session.scanner);
      session.capabilities = capabilities;
      const modes = Array.isArray(capabilities.focusMode) ? capabilities.focusMode : [];
      session.focusMode = modes.includes('continuous') ? 'continuous' : modes.includes('single-shot') ? 'single-shot' : '';
      if (session.focusMode) {
        try {
          if(await apply(session,{focusMode:session.focusMode})) {
            focus.hidden = false;
            status.textContent = session.focusMode === 'continuous' ? 'เปิดโฟกัสต่อเนื่องแล้ว' : 'เปิดโฟกัสอัตโนมัติแล้ว';
          }
        } catch {status.textContent = 'กล้องปรับโฟกัสเอง หากภาพเบลอให้เลือกกล้องหลังตัวอื่น';}
      } else status.textContent = 'กล้องปรับโฟกัสเอง หากภาพเบลอให้เลือกกล้องหลังตัวอื่น';
      if (!live(session)) return;
      if (range(capabilities.zoom)) {
        const {min,max,step} = capabilities.zoom;
        const limit = Math.min(max,Math.max(min,4));
        const increment = step > 0 ? step : 0.1;
        zoom.min = String(min);zoom.max = String(limit);zoom.step = String(increment);
        const initial = clamp(Number(settings.zoom) || min,min,limit);
        const target = clamp(min+Math.round((clamp(1.5,min,limit)-min)/increment)*increment,min,limit);
        zoom.value = String(initial);zoomValue.textContent = initial.toFixed(1)+'×';zoomLabel.hidden = false;
        if (target > initial) {
          try {if(await apply(session,{zoom:target})){zoom.value = String(target);zoomValue.textContent = target.toFixed(1)+'×';}}catch{}
        }
      }
      torch.hidden = !(capabilities.torch === true || capabilities.torch?.includes?.(true));
      if (!navigator.mediaDevices?.enumerateDevices || !live(session)) return;
      try {
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput' && d.deviceId);
        if (!live(session)) return;
        camera.replaceChildren();
        const activeId = readSettings(session.scanner).deviceId;
        devices.forEach((device,index) => {
          const option = document.createElement('option');option.value = device.deviceId;
          option.textContent = device.label || 'กล้อง '+(index+1);camera.append(option);
        });
        camera.value = activeId || chosenDevice || devices[0]?.deviceId || '';
        cameraLabel.hidden = devices.length < 2;camera.disabled = false;
      } catch {} // Camera enumeration is optional; keep the active camera running.
    }
    function start(deviceId = chosenDevice) {
      const token = ++generation;
      return enqueue(async () => {
        await controls;await dispose(current);
        if (token !== generation) return;
        box.hidden = false;resetControls();
        let session;
        try {
          if (!window.isSecureContext) throw new Error('กล้องต้องเปิดผ่าน HTTPS ใช้ช่องพิมพ์บาร์โค้ดแทนได้');
          await loadLibrary();if(token !== generation)return;
          const formats = window.Html5QrcodeSupportedFormats;
          const scanner = new window.Html5Qrcode(readerId,{formatsToSupport:[formats.EAN_13,formats.EAN_8,formats.UPC_A,formats.UPC_E,formats.CODE_128,formats.CODE_39,formats.ITF],useBarCodeDetectorIfSupported:false,verbose:false});
          session = {scanner,generation:token,ready:false,handled:false,desired:{},quality,lastCode:'',lastAt:0};current = session;
          const cameraConstraints = deviceId ? {deviceId:{exact:deviceId}} : {facingMode:'environment'};
          const detected = value => {
            if (!live(session)) return;
            const code = String(value).trim(), now = Date.now();if(!code)return;
            // Require the same result twice; never convert a barcode to Number.
            if (session.lastCode !== code || now-session.lastAt > 1500) {session.lastCode = code;session.lastAt = now;return;}
            session.handled = true;
            const stoppedAt = generation+1;
            stop().then(() => {if(generation === stoppedAt)return onDetected(code);}).catch(error => onError(message(error)));
          };
          const config = {fps:12,disableFlip:true,videoConstraints:{...(deviceId ? cameraConstraints : {facingMode:{ideal:'environment'}}),...quality}};
          // Scan the full video, so a long barcode isn't cut by a narrow crop.
          try {await scanner.start(cameraConstraints,config,detected,() => {});}
          catch(error) {
            if (token !== generation) return;
            if (!/Overconstrained|ConstraintNotSatisfied/i.test(error?.name || String(error))) throw error;
            session.quality = {};
            await scanner.start(cameraConstraints,{fps:12,disableFlip:true},detected,() => {});
          }
          session.ready = true;
          if (token !== generation) {await dispose(session);return;}
          chosenDevice = deviceId;
          nativeScan(session,detected);
          await configure(session);
        } catch(error) {
          await dispose(session);
          if(token === generation){box.hidden = true;onError(message(error));}
        }
      });
    }
    zoom.addEventListener('change',() => {
      const requested = Number(zoom.value);
      control(async session => {
        const capabilities = session.capabilities.zoom;
        const value = clamp(requested,capabilities.min,Math.min(capabilities.max,Number(zoom.max)));
        if(await apply(session,{zoom:value})){zoom.value = String(value);zoomValue.textContent = value.toFixed(1)+'×';}
      });
    });
    zoom.addEventListener('input',() => {zoomValue.textContent = Number(zoom.value).toFixed(1)+'×';});
    torch.addEventListener('click',() => control(async session => {
      const enabled = !session.desired.torch;
      if(await apply(session,{torch:enabled})){torch.textContent = enabled ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย';torch.setAttribute('aria-pressed',String(enabled));}
    }));
    focus.addEventListener('click',() => control(async session => {
      if(await apply(session,{focusMode:session.focusMode})) status.textContent = 'กำลังโฟกัส ให้ถือป้ายนิ่งสักครู่';
    }));
    camera.addEventListener('change',() => {camera.disabled = true;start(camera.value);});
    window.addEventListener('pagehide',stop);
    return {start,stop};
  }
  window.BarcodeCamera = {create};
})();
