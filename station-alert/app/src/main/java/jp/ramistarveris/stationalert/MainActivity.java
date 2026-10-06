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
import java.util.Locale;

public class MainActivity extends Activity {
    private EditText name, targetLat, targetLon, prevLat, prevLon;
    private Spinner type;
    private TextView status;
    private static final int REQ_LOCATION = 10, REQ_NOTIFY = 11;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        buildUi();
        load();
        requestNeededPermissions();
    }

    private TextView label(String s) {
        TextView v=new TextView(this); v.setText(s); v.setTextSize(13); v.setTextColor(Color.DKGRAY);
        v.setPadding(0,18,0,5); return v;
    }
    private EditText field(String hint) {
        EditText e=new EditText(this); e.setHint(hint); e.setTextSize(16);
        e.setSingleLine(true); e.setPadding(16,10,16,10); return e;
    }
    private Button button(String s) {
        Button b=new Button(this); b.setText(s); b.setAllCaps(false); return b;
    }
    private void buildUi() {
        ScrollView sc=new ScrollView(this);
        LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(36,45,36,50); sc.addView(root);

        TextView title=new TextView(this); title.setText("到着前通知"); title.setTextSize(28); title.setTextColor(Color.BLACK);
        title.setTypeface(null,1); root.addView(title);
        TextView sub=new TextView(this); sub.setText("前の駅・電停を通過してから目的地への接近を判定します。");
        sub.setTextSize(14); sub.setPadding(0,8,0,18); root.addView(sub);

        root.addView(label("目的地名")); name=field("例：騎射場"); root.addView(name);
        root.addView(label("種類")); type=new Spinner(this);
        type.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_spinner_dropdown_item,
                new String[]{"駅（500m前）","市電電停（100m前）"})); root.addView(type);

        root.addView(label("目的地 緯度 / 経度"));
        LinearLayout a=new LinearLayout(this); a.setOrientation(LinearLayout.HORIZONTAL);
        targetLat=field("緯度"); targetLon=field("経度"); targetLat.setInputType(8194); targetLon.setInputType(8194);
        a.addView(targetLat,new LinearLayout.LayoutParams(0,-2,1)); a.addView(targetLon,new LinearLayout.LayoutParams(0,-2,1)); root.addView(a);

        root.addView(label("直前の駅・電停 緯度 / 経度"));
        LinearLayout p=new LinearLayout(this); p.setOrientation(LinearLayout.HORIZONTAL);
        prevLat=field("緯度"); prevLon=field("経度"); prevLat.setInputType(8194); prevLon.setInputType(8194);
        p.addView(prevLat,new LinearLayout.LayoutParams(0,-2,1)); p.addView(prevLon,new LinearLayout.LayoutParams(0,-2,1)); root.addView(p);

        TextView hint=new TextView(this);
        hint.setText("緯度・経度は Google マップ等で地点を長押しすると確認できます。直前地点は誤通知防止に使います。");
        hint.setTextSize(12); hint.setPadding(0,10,0,18); root.addView(hint);

        Button start=button("監視を開始"); start.setOnClickListener(v->startTracking()); root.addView(start);
        Button stop=button("監視を停止"); stop.setOnClickListener(v->{stopService(new Intent(this,TrackingService.class)); status.setText("停止中");}); root.addView(stop);
        Button bg=button("バックグラウンド位置情報の設定を開く");
        bg.setOnClickListener(v->openSettings()); root.addView(bg);

        status=new TextView(this); status.setText("停止中"); status.setTextSize(16); status.setPadding(0,22,0,0); root.addView(status);
        setContentView(sc);
    }
    private void requestNeededPermissions() {
        if (Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},REQ_NOTIFY);
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},REQ_LOCATION);
    }
    private void openSettings() {
        Intent i=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:"+getPackageName()));
        startActivity(i);
        Toast.makeText(this,"権限 → 位置情報 →「常に許可」を選択してください",Toast.LENGTH_LONG).show();
    }
    private double num(EditText e) throws Exception { return Double.parseDouble(e.getText().toString().trim()); }
    private void startTracking() {
        try {
            if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED) {
                requestNeededPermissions(); Toast.makeText(this,"位置情報を許可してください",Toast.LENGTH_LONG).show(); return;
            }
            SharedPreferences sp=getSharedPreferences("cfg",0);
            sp.edit().putString("name",name.getText().toString().trim())
              .putInt("type",type.getSelectedItemPosition())
              .putLong("tlat",Double.doubleToRawLongBits(num(targetLat))).putLong("tlon",Double.doubleToRawLongBits(num(targetLon)))
              .putLong("plat",Double.doubleToRawLongBits(num(prevLat))).putLong("plon",Double.doubleToRawLongBits(num(prevLon)))
              .putBoolean("armed",false).putBoolean("notified",false).apply();
            Intent i=new Intent(this,TrackingService.class);
            if (Build.VERSION.SDK_INT>=26) startForegroundService(i); else startService(i);
            status.setText("監視中：前地点の通過待ち");
        } catch(Exception ex) { Toast.makeText(this,"緯度・経度を正しく入力してください",Toast.LENGTH_LONG).show(); }
    }
    private void load() {
        SharedPreferences sp=getSharedPreferences("cfg",0);
        name.setText(sp.getString("name",""));
        type.setSelection(sp.getInt("type",0));
        setNum(targetLat,sp,"tlat"); setNum(targetLon,sp,"tlon"); setNum(prevLat,sp,"plat"); setNum(prevLon,sp,"plon");
    }
    private void setNum(EditText e,SharedPreferences sp,String k) {
        if(sp.contains(k)) e.setText(String.format(Locale.US,"%.6f",Double.longBitsToDouble(sp.getLong(k,0))));
    }
}
