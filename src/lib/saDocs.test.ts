// @vitest-environment jsdom
import {it,expect} from 'vitest'
import {sanitizeSaDocs} from './saDocs'
it('preserves text formatting but removes executable HTML and remote CSS',()=>{
 const html=sanitizeSaDocs('<script>alert(1)</script><img src=x onerror=alert(1)><p style="font-family:Georgia;font-size:24px;background-image:url(https://example.com/track)"><u>API</u><a href="javascript:alert(1)">link</a></p>')
 expect(html).toContain('<u>API</u>');expect(html).toContain('font-size: 24px')
 expect(html).not.toContain('<script');expect(html).not.toContain('<img');expect(html).not.toContain('javascript:');expect(html).not.toContain('example.com')
})
