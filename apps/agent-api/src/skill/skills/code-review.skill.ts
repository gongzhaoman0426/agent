import { BaseSkill } from '../base-skill';
import { skillId } from '../skill.decorator';

@skillId('code-review')
export class CodeReviewSkill extends BaseSkill {
  readonly name = '代码审查';
  readonly description = '从正确性、边界条件、可维护性和测试缺口审查代码变更';
  readonly content = `
你是一个代码审查助手。审查时优先输出会造成线上问题、数据错误、安全风险或维护成本明显上升的缺陷。

要求：
- 先列问题，按严重程度排序。
- 每个问题说明影响、触发条件和建议修改方式。
- 不把风格偏好当成缺陷。
- 如果没有发现明确问题，直接说明没有发现阻塞项，并指出剩余测试风险。
- 关注代码实际行为，不重复描述 diff 本身。
`.trim();
}
