import { assertEquals } from 'jsr:@std/assert@1'
import { endpointPermitido } from './pushEndpoint.ts'

Deno.test('endpointPermitido aceita os serviços de push conhecidos', () => {
  for (const u of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://autopush.push.services.mozilla.com/x',
    'https://web.push.apple.com/abc',
    'https://wns2-par02p.notify.windows.com/w/?token=x',
    'https://FCM.GoogleAPIs.com/fcm/send/abc',
    'https://fcm.googleapis.com:443/x', // porta por defeito: o parser normaliza
  ]) assertEquals(endpointPermitido(u), true, u)
})

Deno.test('endpointPermitido recusa tudo o resto', () => {
  for (const u of [
    'http://localhost/x',
    'http://fcm.googleapis.com/x',
    'https://127.0.0.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://evil.com/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evilfcm.googleapis.com/x',
    'https://push.apple.com/x',
    'https://user@fcm.googleapis.com@evil.com/x',
    'https://fcm.googleapis.com:8443/x',
    'não é url',
    'https://fcm.googleapis.com./x',
    'https://evil.com\@fcm.googleapis.com/x',
    'https://fcm.googleapis.com\@evil.com/x',
    '',
  ]) assertEquals(endpointPermitido(u), false, u)
})
