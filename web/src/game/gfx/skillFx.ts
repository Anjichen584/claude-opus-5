/**
 * 技能特效档案(第五批之三):技能 id → 用哪张贴图、怎么回退。
 *
 * 为什么单独一张表:特效的失败模式是**静默降级**(贴图没加载就退回程序化,线上看不出异常),
 * 而技能与贴图的对应关系散落在 `SkillSystem.ts` 的 30+ 处 emit 里,没人能一眼看出"哪个技能还没贴图"。
 * 这张表把对应关系集中起来,由 `gfx/__tests__/skillFx.test.ts` 守卫。
 *
 * 注意:这里是**声明**,实际发射在 `skills/SkillSystem.ts`(它把 sprite 名塞进 FxEvent)。
 * 两边不一致时测试会红 —— 这正是这张表存在的意义。
 */

export interface SkillFxSpec {
  /** 专属贴图名;null = 该技能用通用贴图(弧光/扩散环) */
  sprite: string | null;
  /** 人类可读的说明(给未来的自己看为什么这么配) */
  note: string;
}

export const SKILL_FX: Record<string, SkillFxSpec> = {
  blade_q_cleave: { sprite: null, note: '三段弧光(fx_slash)已够表达,不额外做贴图' },
  blade_e_tidestep: { sprite: null, note: '突进用拖尾残影(fx_dash_trail,由 DashGhostEvent 统一画)' },
  blade_r_starfall: { sprite: 'fx_swordfall', note: '星陨:下落的星剑,是剑士的职业签名' },
  ranger_q_fan: { sprite: null, note: '三连射是弹丸本身,不需要地面贴图' },
  ranger_e_nova: { sprite: null, note: '落点环箭用扩散环即可' },
  ranger_r_storm: { sprite: 'fx_arrowrain', note: '箭雨落点标记,玩家靠它判断安全区' },
  arcanist_q_seeker: { sprite: null, note: '追踪弹丸自表达' },
  arcanist_e_blink: { sprite: null, note: '闪现用起点/终点双环' },
  arcanist_r_tempest: { sprite: 'fx_vortex', note: '元素风暴:四色漩涡,一眼看出"这团里有四种元素"' },
  warden_q_quake: { sprite: 'fx_crack', note: '岩震击:地面裂纹,让"砸地"有重量' },
  warden_e_charge: { sprite: 'fx_shockwave', note: '冲锋终点撞击' },
  warden_r_roar: { sprite: 'fx_shockwave', note: '大地怒吼:三层冲击波由近及远' },
};

/**
 * 回退链:每一层都保底。
 * 顺序 = 专属贴图 → 通用贴图(弧光/光柱/扩散环)→ null(= 调用方程序化绘制)。
 */
export const FX_FALLBACK: Record<string, Array<string | null>> = {
  slash: ['fx_slash', null],
  beam: ['fx_beam', null],
  ring: ['fx_ring', null],
  burst: ['fx_burst', null],
  swordfall: ['fx_swordfall', 'fx_beam', null],
  vortex: ['fx_vortex', 'fx_ring', null],
  shockwave: ['fx_shockwave', 'fx_ring', null],
  crack: ['fx_crack', 'fx_ring', null],
  arrowrain: ['fx_arrowrain', 'fx_beam', null],
  dashTrail: ['fx_dash_trail', null],
};

/** 技能 id → 专属贴图名(供 SkillSystem 与测试共用,避免两边各写一份) */
export function spriteOfSkill(skillId: string): string | null {
  return SKILL_FX[skillId]?.sprite ?? null;
}
