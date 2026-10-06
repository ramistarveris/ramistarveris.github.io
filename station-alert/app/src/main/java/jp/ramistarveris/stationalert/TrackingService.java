package jp.ramistarveris.stationalert;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import java.util.*;

public class TrackingService extends Service implements LocationListener {
    private static final String CH_MON="monitor", CH_ALERT="arrival";
    private LocationManager lm;
    private SharedPreferences sp;
    private final ArrayDeque<Float> recent = new ArrayDeque<>();
    private boolean armed, notified;
    private float bestPrev=Float.MAX_VALUE;
    private boolean wasNearPrev=false;

    @Override public void onCreate() {
        super.onCreate(); sp=getSharedPreferences("cfg",0);
        armed=sp.getBoolean("armed",false); notified=sp.getBoolean("notified",false);
        createChannels();
        startForeground(41, monitorNotification("位置情報を監視しています"));
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED) {
            try { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,2000,3,this); } catch(Exception ignored){}
            try { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,3000,5,this); } catch(Exception ignored){}
        }
    }
    private void createChannels() {
        NotificationManager nm=getSystemService(NotificationManager.class);
        if(Build.VERSION.SDK_INT>=26) {
            NotificationChannel m=new NotificationChannel(CH_MON,"位置監視",NotificationManager.IMPORTANCE_LOW);
            NotificationChannel a=new NotificationChannel(CH_ALERT,"到着前通知",NotificationManager.IMPORTANCE_HIGH);
            a.enableVibration(true); a.setVibrationPattern(new long[]{0,500,250,500,250,900});
            nm.createNotificationChannel(m); nm.createNotificationChannel(a);
        }
    }
    private Notification monitorNotification(String text) {
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent pi=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,Build.VERSION.SDK_INT>=26?CH_MON:null)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("到着前通知：監視中")
                .setContentText(text).setOngoing(true).setContentIntent(pi).build();
    }
    private double val(String k){ return Double.longBitsToDouble(sp.getLong(k,0)); }
    private float dist(Location l,double lat,double lon) {
        float[] r=new float[1]; Location.distanceBetween(l.getLatitude(),l.getLongitude(),lat,lon,r); return r[0];
    }
    @Override public void onLocationChanged(Location l) {
        if(l.hasAccuracy() && l.getAccuracy()>80) return;
        float dp=dist(l,val("plat"),val("plon"));
        float dt=dist(l,val("tlat"),val("tlon"));

        if(!armed) {
            bestPrev=Math.min(bestPrev,dp);
            if(dp<=120) wasNearPrev=true;
            // 「前地点に十分近づいた後、離れた」ことで通過と判定
            if(wasNearPrev && dp>=160 && bestPrev<=120) {
                armed=true; recent.clear(); sp.edit().putBoolean("armed",true).apply();
                getSystemService(NotificationManager.class).notify(41,monitorNotification("前地点を通過。目的地への接近を判定中"));
            }
            return;
        }
        if(notified) return;
        recent.addLast(dt); while(recent.size()>4) recent.removeFirst();
        if(recent.size()<4) return;
        Float[] d=recent.toArray(new Float[0]);
        boolean approaching=d[0]>d[1] && d[1]>=d[2]-8 && d[2]>d[3];
        int threshold=sp.getInt("type",0)==0?500:100;
        if(approaching && dt<=threshold) notifyArrival(dt,threshold);
    }
    private void notifyArrival(float meters,int threshold) {
        notified=true; sp.edit().putBoolean("notified",true).apply();
        String n=sp.getString("name","目的地"); if(n.isEmpty()) n="目的地";
        Notification.Builder b=new Notification.Builder(this,Build.VERSION.SDK_INT>=26?CH_ALERT:null)
            .setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle("まもなく "+n+" です")
            .setContentText("目的地まで約 "+Math.max(10,Math.round(meters/10)*10)+"m")
            .setAutoCancel(true).setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_ALL);
        getSystemService(NotificationManager.class).notify(99,b.build());
        if(Build.VERSION.SDK_INT>=26) getSystemService(Vibrator.class).vibrate(VibrationEffect.createWaveform(new long[]{0,500,250,500,250,900},-1));
        stopSelf();
    }
    @Override public void onProviderEnabled(String p) {}
    @Override public void onProviderDisabled(String p) {}
    @Override public android.os.IBinder onBind(Intent i){return null;}
    @Override public void onDestroy(){ if(lm!=null) try{lm.removeUpdates(this);}catch(Exception ignored){} super.onDestroy(); }
}
