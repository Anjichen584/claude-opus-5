/**
 * 技能特效档案(第五批之三):技能 id → 用哪张贴图、怎么回退。
 *
 * 为什么单独一张表:特效的失败模式是**静默降级**(贴图没加载就退回程序化,线上看不出异常),
 * 而技能与贴图的对应关系散落在 «SkillSystem.ts» 的 30+ 处 emit 里,没人能一眼看出“哪个技能还没贴图”。
 * 这张表把对应关系集中起来,由 «gfx/__tests__/skillFx.test.ts» 守卫。
 *
 * 注意:这里是**声明**,实际发射在 «skills/SkillSystem.ts»(它把 sprite 名塞进 FxEvent)。
 * 两边不一致时测试会红 —— 这正是这张表存在的意义。
 */

export interface SkillFxSpec {
  /** 专属贴图名;null = 该技能用通用贴图(弧光/扩散环) */
  sprite: string | null;
  /** 人类可读的说明(给未来的自己看为什么这么配) */
  note: string;
}

export const SKILL_FX: Record<string, SkillFxSpec> = {
  blade_q_cleave: { sprite: null, note: 'three-stage arc (fx_slash) reads well enough; no extra sprite' },
  blade_e_tidestep: { sprite: null, note: 'dash uses trail ghosts (fx_dash_trail, drawn via DashGhostEvent)' },
  blade_r_starfall: { sprite: 'fx_swordfall', note: 'Starfall: falling star-swords, the blade signature' },
  ranger_q_fan: { sprite: null, note: 'triple shot is the projectile itself; no ground sprite needed' },
  ranger_e_nova: { sprite: 'fx_nova', note: 'Gale Nova: ring of wind blades (round 35 finish)' },
  ranger_r_storm: { sprite: 'fx_arrowrain', note: 'arrow-rain landing marker; players read safe zones from it' },
  arcanist_q_seeker: { sprite: null, note: 'homing projectile expresses itself' },
  arcanist_e_blink: { sprite: 'fx_blink', note: 'Starveil Blink: endpoint star flash (origin keeps the small ring)' },
  arcanist_r_tempest: { sprite: 'fx_vortex', note: 'Elemental Tempest: four-color vortex, four elements at a glance' },
  warden_q_quake: { sprite: 'fx_crack', note: 'Quake Strike: ground cracks give the slam weight' },
  warden_e_charge: { sprite: 'fx_shockwave', note: 'charge endpoint impact' },
  warden_r_roar: { sprite: 'fx_shockwave', note: 'Earth Roar: three shockwaves, near to far' },
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
