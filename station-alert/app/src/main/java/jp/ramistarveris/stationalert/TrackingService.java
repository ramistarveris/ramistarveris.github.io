package jp.ramistarveris.stationalert;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class TrackingService extends Service implements LocationListener {
    static class Stop {
        String id,name; double lat,lon; boolean tram;
        Stop(String i,String n,double a,double o,boolean t){id=i;name=n;lat=a;lon=o;tram=t;}
    }
    private static final String MON="monitor", ALERT="arrival";
    private LocationManager lm;
    private final ArrayList<Stop> stops=new ArrayList<>();
    private Location previous, queryCenter;
    private long lastQuery=0;
    private String lastNotified="", passedId="";
    private float passedBest=Float.MAX_VALUE;
    private boolean passedWasNear=false;
    private Stop target;
    private final ArrayDeque<Float> targetDistances=new ArrayDeque<>();
    private volatile boolean loading=false;

    @Override public void onCreate(){
        super.onCreate(); channels(); startForeground(41,monitor("現在地を取得しています"));
        lm=(LocationManager)getSystemService(LOCATION_SERVICE);
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){
            try{lm.requestLocationUpdates(LocationManager.GPS_PROVIDER,1500,2,this);}catch(Exception ignored){}
            try{lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER,3000,5,this);}catch(Exception ignored){}
        }
    }
    private void channels(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationManager n=getSystemService(NotificationManager.class);
            n.createNotificationChannel(new NotificationChannel(MON,"駅監視",NotificationManager.IMPORTANCE_LOW));
            NotificationChannel a=new NotificationChannel(ALERT,"到着前通知",NotificationManager.IMPORTANCE_HIGH);
            a.enableVibration(true);a.setVibrationPattern(new long[]{0,450,180,450,180,850});n.createNotificationChannel(a);
        }
    }
    private Notification monitor(String s){
        PendingIntent p=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,Build.VERSION.SDK_INT>=26?MON:null).setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("駅到着前通知：自動監視中").setContentText(s).setOngoing(true).setContentIntent(p).build();
    }
    private void mon(String s){getSystemService(NotificationManager.class).notify(41,monitor(s));}

    @Override public void onLocationChanged(Location l){
        if(l.hasAccuracy() && l.getAccuracy()>70)return;
        if(needRefresh(l)) refreshStops(l);
        float bearing=movementBearing(l);
        float speed=l.hasSpeed()?l.getSpeed():(previous==null?0:previous.distanceTo(l)/Math.max(1,(l.getTime()-previous.getTime())/1000f));
        if(stops.size()>0 && bearing>=0 && speed>=2.2f) process(l,bearing,speed);
        previous=new Location(l);
    }
    private boolean needRefresh(Location l){
        return !loading && (stops.isEmpty() || queryCenter==null || queryCenter.distanceTo(l)>1200 || System.currentTimeMillis()-lastQuery>10*60*1000);
    }
    private float movementBearing(Location l){
        if(l.hasBearing() && l.hasSpeed() && l.getSpeed()>2.2f)return l.getBearing();
        if(previous!=null && previous.distanceTo(l)>12)return previous.bearingTo(l);
        return -1;
    }
    private void refreshStops(Location l){
        loading=true; queryCenter=new Location(l); lastQuery=System.currentTimeMillis();
        final double lat=l.getLatitude(),lon=l.getLongitude();
        new Thread(()->{
            ArrayList<Stop> got=new ArrayList<>();
            try{
                String q="[out:json][timeout:20];(node(around:4500,"+lat+","+lon+")[railway=station];node(around:4500,"+lat+","+lon+")[railway=halt];node(around:4500,"+lat+","+lon+")[railway=tram_stop];);out body;";
                URL u=new URL("https://overpass-api.de/api/interpreter?data="+URLEncoder.encode(q,"UTF-8"));
                HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setConnectTimeout(12000);c.setReadTimeout(20000);
                c.setRequestProperty("User-Agent","StationArrivalAlert/2.0");
                StringBuilder sb=new StringBuilder();try(BufferedReader br=new BufferedReader(new InputStreamReader(c.getInputStream(),StandardCharsets.UTF_8))){
                    String x;while((x=br.readLine())!=null)sb.append(x);
                }
                JSONArray a=new JSONObject(sb.toString()).getJSONArray("elements");
                for(int i=0;i<a.length();i++){
                    JSONObject o=a.getJSONObject(i), tags=o.optJSONObject("tags");if(tags==null)continue;
                    String name=tags.optString("name","");if(name.isEmpty())continue;
                    boolean tram="tram_stop".equals(tags.optString("railway")) || "tram".equals(tags.optString("station"));
                    got.add(new Stop(String.valueOf(o.optLong("id")),name,o.getDouble("lat"),o.getDouble("lon"),tram));
                }
                synchronized(stops){stops.clear();stops.addAll(got);}
                mon(got.isEmpty()?"周辺の駅を検索中":"自動判定中（周辺 "+got.size()+"駅）");
            }catch(Exception e){mon("駅データ再取得待ち（位置監視は継続）");}
            loading=false;
        }).start();
    }
    private void process(Location l,float heading,float speed){
        Stop best=null; double bestScore=1e9; float bestDist=0;
        ArrayList<Stop> copy; synchronized(stops){copy=new ArrayList<>(stops);}
        for(Stop s:copy){
            float[] r=new float[2];Location.distanceBetween(l.getLatitude(),l.getLongitude(),s.lat,s.lon,r);
            float d=r[0], diff=angle(heading,r[1]);
            if(d<35 || d>3500 || diff>48)continue;
            // 市電は駅間が短いので近距離候補を強く優先。鉄道は方向一致を重視。
            double score=d + diff*(s.tram?5.0:12.0);
            if(score<bestScore){bestScore=score;best=s;bestDist=d;}
        }
        if(best==null){target=null;targetDistances.clear();return;}
        if(target==null || !target.id.equals(best.id)){target=best;targetDistances.clear();}
        targetDistances.addLast(bestDist);while(targetDistances.size()>4)targetDistances.removeFirst();
        mon((best.tram?"市電 ":"鉄道 ")+best.name+" 約"+Math.round(bestDist)+"m");

        // 通過駅を記録し、同じ駅を直後に再ターゲット化しない
        if(bestDist<passedBest){passedBest=bestDist;}
        if(bestDist<55)passedWasNear=true;
        if(passedWasNear && bestDist>90){passedId=best.id;passedBest=Float.MAX_VALUE;passedWasNear=false;target=null;targetDistances.clear();return;}
        if(best.id.equals(passedId))return;

        int threshold=best.tram?100:500;
        if(bestDist<=threshold && targetDistances.size()>=3 && approaching() && !best.id.equals(lastNotified)){
            alert(best,bestDist);lastNotified=best.id;
        }
    }
    private boolean approaching(){
        Float[] a=targetDistances.toArray(new Float[0]);int n=a.length;
        return n>=3 && a[n-1] < a[n-2]+5 && a[n-2] < a[n-3]+5 && a[n-1] < a[n-3]-5;
    }
    private float angle(float a,float b){float d=Math.abs(((a-b+540)%360)-180);return d;}
    private void alert(Stop s,float d){
        String kind=s.tram?"電停":"駅";
        Notification n=new Notification.Builder(this,Build.VERSION.SDK_INT>=26?ALERT:null)
            .setSmallIcon(android.R.drawable.ic_dialog_map).setContentTitle("まもなく "+s.name+" "+kind)
            .setContentText("約 "+Math.max(10,Math.round(d/10)*10)+"m先です").setAutoCancel(true)
            .setPriority(Notification.PRIORITY_MAX).setDefaults(Notification.DEFAULT_ALL).build();
        getSystemService(NotificationManager.class).notify((int)(1000+Math.abs(s.id.hashCode()%10000)),n);
        if(Build.VERSION.SDK_INT>=26)getSystemService(Vibrator.class).vibrate(VibrationEffect.createWaveform(new long[]{0,450,180,450,180,850},-1));
    }
    @Override public void onProviderEnabled(String p){}
    @Override public void onProviderDisabled(String p){}
    @Override public android.os.IBinder onBind(Intent i){return null;}
    @Override public void onDestroy(){if(lm!=null)try{lm.removeUpdates(this);}catch(Exception ignored){}super.onDestroy();}
}