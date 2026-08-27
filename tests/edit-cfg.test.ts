/**
 * 配置字段坐标注入（src/lib/edit-cfg.ts，M12d）测试：
 * OH_EDIT=1 时产出 data-oh-cfg / data-oh-cfg-block 坐标，生产模式（无 OH_EDIT）零注入。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { editCfgValue, editCfgAttr, editCfgBlockName } from '../src/lib/edit-cfg.ts';

afterEach(() => {
  delete process.env.OH_EDIT;
});

describe('editCfgValue / editCfgAttr', () => {
  it('OH_EDIT=1：返回 <path>@<lang> 坐标', () => {
    process.env.OH_EDIT = '1';
    expect(editCfgValue('site.title', 'zh')).toBe('site.title@zh');
    expect(editCfgAttr('profile.name', 'en')).toEqual({ 'data-oh-cfg': 'profile.name@en' });
  });

  it('生产模式（无 OH_EDIT）：空对象 / undefined，零注入', () => {
    expect(editCfgValue('site.title', 'zh')).toBeUndefined();
    expect(editCfgAttr('site.title', 'zh')).toEqual({});
  });

  it('OH_EDIT 为其他值同样不注入', () => {
    process.env.OH_EDIT = '0';
    expect(editCfgAttr('footer.text', 'zh')).toEqual({});
  });
});

describe('editCfgBlockName', () => {
  it('OH_EDIT=1：返回区块坐标值；生产模式 undefined', () => {
    process.env.OH_EDIT = '1';
    expect(editCfgBlockName('profile')).toBe('profile');
    expect(editCfgBlockName('streaming:welcome')).toBe('streaming:welcome');
    delete process.env.OH_EDIT;
    expect(editCfgBlockName('editorial:work')).toBeUndefined();
  });
});
