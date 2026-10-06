package jp.ramistarveris.stationalert;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.widget.*;

public class MainActivity extends Activity {
    private TextView status;
    @Override public void onCreate(Bundle b){super.onCreate(b); buildUi(); requestPermissionsIfNeeded();}
    private Button btn(String s){Button b=new Button(this);b.setText(s);b.setAllCaps(false);return b;}
    private void buildUi(){
        LinearLayout r=new LinearLayout(this);r.setOrientation(LinearLayout.VERTICAL);r.setPadding(38,55,38,45);
        TextView t=new TextView(this);t.setText("駅到着前通知");t.setTextSize(29);t.setTextColor(Color.BLACK);t.setTypeface(null,1);r.addView(t);
        TextView d=new TextView(this);d.setText("現在地から乗車中の鉄道・市電と進行方向を自動判定し、次の駅を追跡します。\n\n鉄道 500m前 / 市電 100m前");d.setTextSize(16);d.setPadding(0,16,0,30);r.addView(d);
        Button start=btn("自動監視を開始"); start.setOnClickListener(v->start());r.addView(start);
        Button stop=btn("監視を停止");stop.setOnClickListener(v->{stopService(new Intent(this,TrackingService.class));status.setText("停止中");});r.addView(stop);
        Button perm=btn("バックグラウンド位置情報を許可");perm.setOnClickListener(v->{
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:"+getPackageName())));
            Toast.makeText(this,"権限 → 位置情報 → 常に許可 を選択してください",Toast.LENGTH_LONG).show();
        });r.addView(perm);
        status=new TextView(this);status.setText("停止中");status.setTextSize(16);status.setPadding(0,28,0,0);r.addView(status);
        TextView note=new TextView(this);note.setText("駅名・緯度経度の入力は不要です。監視中は位置情報の常時利用と通信を行います。");note.setTextSize(12);note.setPadding(0,18,0,0);r.addView(note);
        setContentView(r);
    }
    private void requestPermissionsIfNeeded(){
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},11);
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},10);
    }
    private void start(){
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){requestPermissionsIfNeeded();return;}
        Intent i=new Intent(this,TrackingService.class);if(Build.VERSION.SDK_INT>=26)startForegroundService(i);else startService(i);
        status.setText("自動監視中");
    }
}