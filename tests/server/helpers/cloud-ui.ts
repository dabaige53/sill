import assert from 'node:assert/strict';
export async function waitCloud(page){
 await page.locator('body.cloud-signed-in').waitFor();
 assert.equal(await page.locator('#cloud-account').count(),0,'no top account/icon toolbar or placeholder');
 assert.ok(await page.locator('main').evaluate(e=>e.getBoundingClientRect().top<=1),'content starts at viewport top');
}
export async function cloudTool(page,action){await page.locator('#orb').click();await page.locator('.dock-tools [data-action='+action+']').click();}
export async function cloudLogout(page){await cloudTool(page,'settings');await page.locator('[data-action=settings-group][data-extra=data]').click();await page.locator('#cloud-logout').click({trial:true});assert.ok(await page.locator('#cloud-logout').evaluate(e=>e.getBoundingClientRect().height>=44));await page.locator('#cloud-logout').click();}
