package jp.ramistarveris.stationalert;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.view.*;
import android.widget.*;

public class MainActivity extends Activity {
    private TextView status,next,prev,nearestRail,nearestTram,mode;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Runnable refresh=new Runnable(){public void run(){refreshStatus();handler.postDelayed(this,1000);}};
    @Override public void onCreate(Bundle b){super.onCreate(b);buildUi();requestPermissionsIfNeeded();}
    @Override protected void onResume(){super.onResume();handler.post(refresh);}
    @Override protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
    private TextView tv(String s,float z){TextView v=new TextView(this);v.setText(s);v.setTextSize(z);v.setTextColor(Color.DKGRAY);return v;}
    private Button btn(String s){Button b=new Button(this);b.setText(s);b.setAllCaps(false);return b;}
    private void buildUi(){
        ScrollView sc=new ScrollView(this);LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.VERTICAL);
        int top=dp(20); if(Build.VERSION.SDK_INT>=23)r.setPadding(dp(24),top,dp(24),dp(32)); sc.addView(r);
        if(Build.VERSION.SDK_INT>=21){getWindow().setStatusBarColor(Color.WHITE);getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);}
        if(Build.VERSION.SDK_INT>=35){getWindow().setStatusBarColor(Color.TRANSPARENT);r.setOnApplyWindowInsetsListener((v,in)->{android.graphics.Insets x=in.getInsets(WindowInsets.Type.statusBars());v.setPadding(dp(24),x.top+dp(18),dp(24),dp(32));return in;});}
        TextView t=tv("駅到着前通知",29);t.setTextColor(Color.BLACK);t.setTypeface(null,1);r.addView(t);
        mode=tv("乗車判定待ち",14);mode.setPadding(0,dp(8),0,dp(20));r.addView(mode);
        TextView nl=tv("次の駅",13);r.addView(nl);next=tv("—",30);next.setTextColor(Color.BLACK);next.setTypeface(null,1);next.setPadding(0,dp(2),0,dp(5));r.addView(next);
        prev=tv("← 前の駅：—",16);prev.setPadding(0,0,0,dp(22));r.addView(prev);
        Button start=btn("自動監視を開始");start.setOnClickListener(v->start());r.addView(start);
        Button stop=btn("監視を停止");stop.setOnClickListener(v->{stopService(new Intent(this,TrackingService.class));getSharedPreferences("live",0).edit().putBoolean("running",false).apply();refreshStatus();});r.addView(stop);
        Button perm=btn("バックグラウンド位置情報を許可");perm.setOnClickListener(v->{startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));Toast.makeText(this,"権限 → 位置情報 → 常に許可",Toast.LENGTH_LONG).show();});r.addView(perm);
        status=tv("停止中",16);status.setPadding(0,dp(20),0,dp(22));r.addView(status);
        TextView near=tv("現在地の最寄り",13);near.setTypeface(null,1);r.addView(near);
        nearestRail=tv("鉄道駅　検索待ち",16);nearestRail.setPadding(0,dp(8),0,dp(6));r.addView(nearestRail);
        nearestTram=tv("市電　　検索待ち",16);r.addView(nearestTram);
        setContentView(sc);
    }
    private int dp(int x){return Math.round(x*getResources().getDisplayMetrics().density);}
    private void refreshStatus(){
        SharedPreferences p=getSharedPreferences("live",0);boolean run=p.getBoolean("running",false);String m=p.getString("mode","");
        mode.setText(m.isEmpty()?"乗車判定待ち":m);status.setText(run?p.getString("status","自動監視中"):"停止中");
        next.setText(p.getString("next","—"));String pr=p.getString("prev","—");prev.setText("← 前の駅："+pr);
        nearestRail.setText("鉄道駅　"+p.getString("nearestRail","検索待ち"));nearestTram.setText("市電　　"+p.getString("nearestTram","検索待ち"));
    }
    private void requestPermissionsIfNeeded(){if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},11);if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},10);}
    private void start(){if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissionsIfNeeded();return;}Intent i=new Intent(this,TrackingService.class);if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);getSharedPreferences("live",0).edit().putBoolean("running",true).apply();refreshStatus();}
}