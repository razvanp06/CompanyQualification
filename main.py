import pandas as pd
df = pd.read_json("companies.txt", lines=True)
pd.set_option('display.max_columns', None)
pd.set_option('display.width', 1000)
df.to_html("date.html")


