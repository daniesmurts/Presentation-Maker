import { describe, it, expect } from 'vitest'
import { plural, slidesCount } from './copy'

describe('plural — Russian has three forms', () => {
  it('1 слайд / 2 слайда / 5 слайдов', () => {
    expect(slidesCount(1)).toBe('1 слайд')
    expect(slidesCount(2)).toBe('2 слайда')
    expect(slidesCount(5)).toBe('5 слайдов')
  })
  it('the teens are always the "many" form (11, 12, 14)', () => {
    expect(slidesCount(11)).toBe('11 слайдов')
    expect(slidesCount(12)).toBe('12 слайдов')
    expect(slidesCount(14)).toBe('14 слайдов')
  })
  it('21 goes back to "one", 22 to "few", 0 to "many"', () => {
    expect(slidesCount(21)).toBe('21 слайд')
    expect(slidesCount(22)).toBe('22 слайда')
    expect(plural(0, 'минута', 'минуты', 'минут')).toBe('0 минут')
  })
})
