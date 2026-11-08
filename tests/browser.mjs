import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},hasTouch:mobile,isMobile:mobile});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://localhost:8080');await page.screenshot({path:`artifacts/${mobile?'mobile':'desktop'}-menu.png`,fullPage:true});
 await page.getByRole('button',{name:'Начать забег'}).click();await page.waitForTimeout(1200);assert.equal(await page.locator('#overlay').isHidden(),true);
 if(!mobile){await page.keyboard.down('KeyD');await page.waitForTimeout(400);await page.keyboard.press('Space');await page.keyboard.up('KeyD');}else{
 const joy=await page.locator('#joystick').boundingBox();assert.ok(joy);await page.locator('#joystick').dispatchEvent('pointerdown',{pointerId:1,clientX:joy.x+70,clientY:joy.y+50,pointerType:'touch'});await page.locator('#joystick').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});await page.locator('#dash-touch').dispatchEvent('pointerdown',{pointerType:'touch'});
 }
 await page.locator('#pause').click();assert.ok(await page.getByRole('heading',{name:'Передышка.'}).isVisible());const timer=await page.locator('#timer').textContent();await page.waitForTimeout(1200);assert.equal(await page.locator('#timer').textContent(),timer);await page.getByRole('button',{name:'Продолжить'}).click();
 await page.waitForTimeout(300);if(mobile)assert.ok(await page.locator('#joystick').isVisible());
 await page.screenshot({path:`artifacts/${mobile?'mobile':'desktop'}-game.png`,fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(`${mobile?'Mobile':'Desktop'}: start, controls, dash, pause/resume, layout and runtime OK`);await context.close();
}
await browser.close();
