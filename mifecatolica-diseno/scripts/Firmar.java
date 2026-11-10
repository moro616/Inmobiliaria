import com.android.apksig.*;
import java.io.*; import java.security.*; import java.security.cert.*; import java.util.*;
public class Firmar {
  public static void main(String[] a) throws Exception {
    KeyStore ks = KeyStore.getInstance("PKCS12"); ks.load(new FileInputStream(a[0]), a[1].toCharArray());
    PrivateKey k = (PrivateKey) ks.getKey(a[2], a[1].toCharArray()); X509Certificate c = (X509Certificate) ks.getCertificate(a[2]);
    ApkSigner.SignerConfig sc = new ApkSigner.SignerConfig.Builder("CERT", k, Collections.singletonList(c)).build();
    new ApkSigner.Builder(Collections.singletonList(sc)).setInputApk(new File(a[3])).setOutputApk(new File(a[4])).setV1SigningEnabled(false).setV2SigningEnabled(true).build().sign();
    ApkVerifier.Result r = new ApkVerifier.Builder(new File(a[4])).build().verify();
    System.out.println("verificado=" + r.isVerified() + " v1=" + r.isVerifiedUsingV1Scheme() + " v2=" + r.isVerifiedUsingV2Scheme());
    for (ApkVerifier.IssueWithParams e : r.getErrors()) System.out.println("ERROR " + e);
  }
}
