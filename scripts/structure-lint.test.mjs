// structure-lint 分层规则回归测试。运行：node --test scripts/structure-lint.test.mjs
import { strict as assert } from 'node:assert'
import test from 'node:test'
import { isForbidden } from './structure-lint.mjs'

test('features 禁边覆盖带域前缀的 features:X 层', () => {
  assert.equal(isForbidden('components', 'features:assistant'), true)
  assert.equal(isForbidden('components', 'features:admin'), true)
  assert.equal(isForbidden('components-ui', 'features:monitor'), true)
  assert.equal(isForbidden('lib', 'features:monitor'), true)
  assert.equal(isForbidden('types', 'features:admin'), true)
  assert.equal(isForbidden('api', 'features:assistant'), true)
  assert.equal(isForbidden('stores', 'features:home'), true)
  assert.equal(isForbidden('hooks', 'features:settings'), true)
  assert.equal(isForbidden('contexts', 'features:admin'), true)
  // 无域前缀的 features 层同样被拦
  assert.equal(isForbidden('components', 'features'), true)
})

test('同域 features 自引合法，跨域直连被拦', () => {
  assert.equal(isForbidden('features:admin', 'features:admin'), false)
  assert.equal(isForbidden('features:admin', 'features:monitor'), true)
  assert.equal(isForbidden('features:admin', 'features:assistant'), true)
})

test('合法方向不受 features 禁边影响', () => {
  assert.equal(isForbidden('features:assistant', 'components'), false)
  assert.equal(isForbidden('features:assistant', 'lib'), false)
  assert.equal(isForbidden('app', 'features:assistant'), false)
  assert.equal(isForbidden('components', 'lib'), false)
  assert.equal(isForbidden('components', 'components-ui'), false)
})
