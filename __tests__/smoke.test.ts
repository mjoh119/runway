import fc from 'fast-check'

describe('test runner smoke', () => {
  it('runs a unit test', () => {
    expect(1 + 1).toBe(2)
  })

  it('runs a fast-check property', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    )
  })
})
